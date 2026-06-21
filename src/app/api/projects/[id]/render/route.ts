import { NextResponse } from "next/server";
import { projectStore } from "@/lib/store";
import { getRenderQueue } from "@/lib/queue";
import { ensureRenderHistory, nextRenderVersion, renderProject } from "@/lib/render";

type Context = { params: Promise<{ id: string }> };

export async function POST(_: Request, context: Context) {
  const { id } = await context.params;
  const project = await projectStore.get(id);
  if (!project) return NextResponse.json({ ok: false, error: "项目不存在" }, { status: 404 });
  if (project.status === "RENDERING") {
    return NextResponse.json({ ok: false, error: "视频正在生成中，请稍候" }, { status: 409 });
  }
  const missing = project.scenes.filter((scene) => !scene.assetUrl);
  if (missing.length && process.env.ALLOW_MOCK_RENDER !== "true") {
    return NextResponse.json({ ok: false, error: `还有 ${missing.length} 个分镜未上传素材` }, { status: 409 });
  }
  project.status = "RENDERING";
  project.renderProgress = 15;
  project.renderError = undefined;
  ensureRenderHistory(project);
  const version = nextRenderVersion(project);
  await projectStore.save(project);

  const queue = getRenderQueue();
  if (queue && process.env.FFMPEG_PATH) {
    await queue.add("render-project", { projectId: id }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 50,
      removeOnFail: 100,
    });
    return NextResponse.json({ ok: true, project, mode: "worker", message: "渲染任务已进入队列，可稍后刷新查看进度。" });
  }

  if (process.env.FFMPEG_PATH) {
    try {
      const output = await renderProject(project, async (progress) => {
        project.renderProgress = progress;
        project.updatedAt = new Date().toISOString();
        await projectStore.save(project);
      }, version);
      project.renderOutputs = [...(project.renderOutputs ?? []), output];
      project.outputUrl = output.url;
      project.outputDuration = output.duration;
      project.renderProgress = 100;
      project.status = "REVIEW";
      project.updatedAt = new Date().toISOString();
      await projectStore.save(project);
      return NextResponse.json({ ok: true, project, mode: "direct", message: `第 ${output.version} 版 MP4 已生成，旧版本已保留。` });
    } catch (error) {
      project.status = "READY_TO_RENDER";
      project.renderError = error instanceof Error ? error.message : "渲染失败";
      project.updatedAt = new Date().toISOString();
      await projectStore.save(project);
      return NextResponse.json({ ok: false, error: project.renderError }, { status: 500 });
    }
  }

  // Development completes as a review preview so the workflow can be tested
  // without native media tools.
  project.renderProgress = 100;
  project.status = "REVIEW";
  project.outputUrl = undefined;
  project.updatedAt = new Date().toISOString();
  await projectStore.save(project);
  return NextResponse.json({
    ok: true,
    project,
    mode: "preview",
    message: "已生成审核预览。配置 Redis、FFmpeg 与 Piper 后由 worker 输出正式 MP4。",
  });
}

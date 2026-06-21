import { NextResponse } from "next/server";
import { projectStore } from "@/lib/store";
import type { Scene } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

function defaultPrompt(style: string, title: string) {
  const styleText = style === "CARTOON"
    ? "高级二维卡通动画，柔和色彩，竖屏构图"
    : style === "COMIC"
      ? "电影感漫画分镜，清晰线稿，情绪化光影，竖屏构图"
      : "亚洲面庞成年人物，电影级写实摄影，自然光，竖屏构图";
  return `${styleText}。主题：${title}。画面干净，无文字，无水印，9:16。`;
}

function normalize(project: NonNullable<Awaited<ReturnType<typeof projectStore.get>>>) {
  project.scenes = project.scenes
    .sort((a, b) => a.order - b.order)
    .map((scene, index) => ({ ...scene, order: index + 1 }));
  project.duration = project.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  project.script = project.scenes.map((scene) => scene.narration).join("");
  if (project.status === "REVIEW" || project.status === "EXPORTED") project.status = "READY_TO_RENDER";
  project.outputUrl = undefined;
  project.outputDuration = undefined;
  project.renderProgress = 0;
  project.updatedAt = new Date().toISOString();
}

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const project = await projectStore.get(id);
    if (!project) return NextResponse.json({ ok: false, error: "项目不存在" }, { status: 404 });
    if (project.status === "RENDERING") return NextResponse.json({ ok: false, error: "视频正在生成中，暂时不能新增分镜" }, { status: 409 });
    if (project.scenes.length >= 12) return NextResponse.json({ ok: false, error: "最多支持 12 个镜头" }, { status: 409 });

    const body = await request.json().catch(() => ({}));
    const insertAfter = Number.isInteger(body.afterOrder) ? Number(body.afterOrder) : project.scenes.length;
    const duration = Number.isInteger(body.duration) ? Math.min(20, Math.max(2, Number(body.duration))) : 8;
    const narration = typeof body.narration === "string" && body.narration.trim()
      ? body.narration.trim().slice(0, 1000)
      : "这里补充新的旁白内容。";
    const scene: Scene = {
      id: crypto.randomUUID(),
      order: insertAfter + 1,
      duration,
      narration,
      subtitle: narration.slice(0, 300),
      composition: "medium shot",
      motion: "static",
      prompt: typeof body.prompt === "string" && body.prompt.trim()
        ? body.prompt.trim().slice(0, 2000)
        : defaultPrompt(project.visualStyle, project.title),
      negativePrompt: "低清晰度，文字，水印，品牌标志，畸形手指，名人脸，未成年人",
    };

    project.scenes = [
      ...project.scenes.filter((item) => item.order <= insertAfter),
      scene,
      ...project.scenes.filter((item) => item.order > insertAfter),
    ];
    normalize(project);
    await projectStore.save(project);
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    const message = error instanceof Error ? error.message : "新增分镜失败";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

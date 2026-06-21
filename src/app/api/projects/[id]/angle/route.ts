import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { buildPlatformCopies } from "@/lib/content";
import { getProvider } from "@/lib/providers/llm";
import { projectStore } from "@/lib/store";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const project = await projectStore.get(id);
    if (!project) return NextResponse.json({ ok: false, error: "项目不存在" }, { status: 404 });

    const body = await request.json();
    const angle = project.angles.find((item) => item.id === body.angleId);
    if (!angle) return NextResponse.json({ ok: false, error: "内容角度不存在" }, { status: 404 });
    if (project.status === "RENDERING") {
      return NextResponse.json({ ok: false, error: "视频正在生成中，暂时不能切换角度" }, { status: 409 });
    }

    const generated = await getProvider("deepseek").generatePlan({
      input: `${project.input}\n\n必须采用这个内容角度：${angle.title}\n开场钩子：${angle.hook}\n核心表达：${angle.coreMessage}`,
      audience: project.audience,
      tone: project.tone,
      avoid: project.avoid,
      duration: project.duration,
      visualStyle: project.visualStyle,
      voiceName: project.voiceName,
      voiceRate: project.voiceRate,
      materialPreference: project.materialPreference,
    });

    project.selectedAngleId = angle.id;
    project.title = angle.title;
    project.hook = angle.hook;
    project.script = generated.script;
    project.scenes = generated.scenes;
    project.platformCopies = buildPlatformCopies(angle.title, generated.script);
    project.status = "DRAFT";
    project.renderProgress = 0;
    project.renderError = undefined;
    project.outputUrl = undefined;
    project.outputDuration = undefined;
    project.updatedAt = new Date().toISOString();
    await projectStore.save(project);

    return NextResponse.json({
      ok: true,
      project,
      message: `已切换到“${angle.title}”，脚本和分镜已重新生成。`,
    });
  } catch (error) {
    return apiError(error);
  }
}

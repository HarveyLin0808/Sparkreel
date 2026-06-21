import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { updateSceneSchema } from "@/lib/schemas";
import { projectStore } from "@/lib/store";

type Context = { params: Promise<{ id: string; sceneId: string }> };

function markStoryboardChanged(project: Awaited<ReturnType<typeof projectStore.get>> & {}) {
  if (!project) return;
  if (project.status === "REVIEW" || project.status === "EXPORTED") project.status = "READY_TO_RENDER";
  project.outputUrl = undefined;
  project.outputDuration = undefined;
  project.renderProgress = 0;
}

function syncProjectFromScenes(project: NonNullable<Awaited<ReturnType<typeof projectStore.get>>>) {
  project.scenes = project.scenes
    .sort((a, b) => a.order - b.order)
    .map((scene, index) => ({ ...scene, order: index + 1 }));
  project.duration = project.scenes.reduce((sum, item) => sum + item.duration, 0);
  project.script = project.scenes.map((item) => item.narration).join("");
  markStoryboardChanged(project);
  project.updatedAt = new Date().toISOString();
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { id, sceneId } = await context.params;
    const project = await projectStore.get(id);
    if (!project) return NextResponse.json({ ok: false, error: "项目不存在" }, { status: 404 });
    if (project.status === "RENDERING") return NextResponse.json({ ok: false, error: "视频正在生成中，暂时不能编辑分镜" }, { status: 409 });
    const scene = project.scenes.find((item) => String(item.id) === sceneId);
    if (!scene) return NextResponse.json({ ok: false, error: "分镜不存在" }, { status: 404 });
    Object.assign(scene, updateSceneSchema.parse(await request.json()));
    syncProjectFromScenes(project);
    await projectStore.save(project);
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    const { id, sceneId } = await context.params;
    const project = await projectStore.get(id);
    if (!project) return NextResponse.json({ ok: false, error: "项目不存在" }, { status: 404 });
    if (project.status === "RENDERING") return NextResponse.json({ ok: false, error: "视频正在生成中，暂时不能删除分镜" }, { status: 409 });
    if (project.scenes.length <= 1) return NextResponse.json({ ok: false, error: "至少保留 1 个镜头" }, { status: 409 });
    const nextScenes = project.scenes.filter((item) => String(item.id) !== sceneId);
    if (nextScenes.length === project.scenes.length) return NextResponse.json({ ok: false, error: "分镜不存在" }, { status: 404 });
    project.scenes = nextScenes;
    syncProjectFromScenes(project);
    await projectStore.save(project);
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    return apiError(error);
  }
}

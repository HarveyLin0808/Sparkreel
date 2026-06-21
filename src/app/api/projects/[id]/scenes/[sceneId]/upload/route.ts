import path from "node:path";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { validateFileSignature, validateUpload } from "@/lib/schemas";
import { getStorage } from "@/lib/storage";
import { projectStore } from "@/lib/store";

type Context = { params: Promise<{ id: string; sceneId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id, sceneId } = await context.params;
    const project = await projectStore.get(id);
    if (!project) return NextResponse.json({ ok: false, error: "项目不存在" }, { status: 404 });
    const searchParams = new URL(request.url).searchParams;
    const requestedOrder = Number(searchParams.get("order"));
    const requestedProvider = searchParams.get("provider");
    const scene = project.scenes.find((item) => String(item.id) === sceneId)
      ?? (Number.isInteger(requestedOrder) ? project.scenes.find((item) => item.order === requestedOrder) : undefined);
    if (!scene) return NextResponse.json({ ok: false, error: "分镜不存在" }, { status: 404 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "请选择文件" }, { status: 400 });
    const validated = validateUpload(file);
    const bytes = new Uint8Array(await file.arrayBuffer());
    validateFileSignature(bytes, file.type);
    const safeName = `${Date.now()}-${crypto.randomUUID()}${path.extname(file.name).toLowerCase()}`;
    const key = `projects/${id}/${sceneId}/${safeName}`;
    scene.assetUrl = await getStorage().put(key, bytes, file.type);
    scene.assetName = file.name.slice(0, 180);
    scene.assetKind = validated.kind;
    scene.assetProvider = requestedProvider === "AI" ? "AI" : "UPLOAD";
    scene.sourceUrl = undefined;
    scene.sourceAuthor = undefined;
    scene.sourceAuthorUrl = undefined;
    if (project.status === "REVIEW" || project.status === "EXPORTED") {
      project.status = "READY_TO_RENDER";
      project.outputUrl = undefined;
      project.outputDuration = undefined;
      project.renderProgress = 0;
    }
    if (project.scenes.every((item) => item.assetUrl) && project.status === "WAITING_ASSETS") project.status = "READY_TO_RENDER";
    project.updatedAt = new Date().toISOString();
    await projectStore.save(project);
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    return apiError(error);
  }
}

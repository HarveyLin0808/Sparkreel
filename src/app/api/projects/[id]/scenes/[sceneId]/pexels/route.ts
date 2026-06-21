import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { buildPexelsQueries, buildPexelsQuery, searchPexelsVideoWithFallback } from "@/lib/pexels";
import { getStorage } from "@/lib/storage";
import { projectStore } from "@/lib/store";

type Context = { params: Promise<{ id: string; sceneId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id, sceneId } = await context.params;
    const project = await projectStore.get(id);
    if (!project) return NextResponse.json({ ok: false, error: "项目不存在" }, { status: 404 });
    const scene = project.scenes.find((item) => String(item.id) === sceneId);
    if (!scene) return NextResponse.json({ ok: false, error: "分镜不存在" }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const explicitQuery = typeof body.query === "string" && body.query.trim() ? body.query.trim().slice(0, 120) : "";
    const generatedQueries = buildPexelsQueries(scene.prompt, project.materialPreference ?? "CHINESE", scene.order);
    const query = explicitQuery || generatedQueries[0] || buildPexelsQuery(scene.prompt) || scene.narration;
    const { video, file } = await searchPexelsVideoWithFallback(
      explicitQuery ? [explicitQuery, ...generatedQueries] : generatedQueries,
    );
    const mediaResponse = await fetch(file.link, { signal: AbortSignal.timeout(120_000) });
    if (!mediaResponse.ok) throw new Error(`Pexels 素材下载失败 (${mediaResponse.status})`);
    const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
    if (bytes.byteLength > 250 * 1024 * 1024) throw new Error("Pexels 素材超过 250MB");
    const key = `projects/${id}/${sceneId}/pexels-${video.id}.mp4`;
    scene.assetUrl = await getStorage().put(key, bytes, "video/mp4");
    scene.assetName = `pexels-${video.id}.mp4`;
    scene.assetKind = "VIDEO";
    scene.assetProvider = "PEXELS";
    scene.sourceUrl = video.url;
    scene.sourceAuthor = video.user?.name;
    scene.sourceAuthorUrl = video.user?.url;
    if (project.status === "REVIEW" || project.status === "EXPORTED") {
      project.status = "READY_TO_RENDER";
      project.outputUrl = undefined;
      project.outputDuration = undefined;
      project.renderProgress = 0;
    }
    project.updatedAt = new Date().toISOString();
    await projectStore.save(project);
    return NextResponse.json({ ok: true, project, query });
  } catch (error) {
    return apiError(error);
  }
}

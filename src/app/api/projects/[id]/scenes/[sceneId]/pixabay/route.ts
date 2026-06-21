import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { buildPexelsQueries, buildPexelsQuery } from "@/lib/pexels";
import {
  searchPixabayImageWithFallback,
  searchPixabayVideoWithFallback,
  type PixabayImageType,
} from "@/lib/pixabay";
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
    const kind: "video" | PixabayImageType =
      body.kind === "illustration" || body.kind === "photo" ? body.kind : "video";
    const explicitQuery = typeof body.query === "string" && body.query.trim() ? body.query.trim().slice(0, 120) : "";
    const generatedQueries = buildPexelsQueries(scene.prompt, project.materialPreference ?? "CHINESE", scene.order);
    const queries = explicitQuery ? [explicitQuery, ...generatedQueries] : generatedQueries;
    const fallback = buildPexelsQuery(scene.prompt) || scene.narration;

    if (kind === "video") {
      const { video, rendition, query } = await searchPixabayVideoWithFallback([...queries, fallback]);
      const mediaResponse = await fetch(rendition.url, { signal: AbortSignal.timeout(120_000) });
      if (!mediaResponse.ok) throw new Error(`Pixabay 素材下载失败 (${mediaResponse.status})`);
      const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
      if (bytes.byteLength > 250 * 1024 * 1024) throw new Error("Pixabay 素材超过 250MB");
      const key = `projects/${id}/${sceneId}/pixabay-${video.id}.mp4`;
      scene.assetUrl = await getStorage().put(key, bytes, "video/mp4");
      scene.assetName = `pixabay-${video.id}.mp4`;
      scene.assetKind = "VIDEO";
      scene.assetProvider = "PIXABAY";
      scene.sourceUrl = video.pageURL;
      scene.sourceAuthor = video.user;
      scene.sourceAuthorUrl = video.user ? `https://pixabay.com/users/${video.user}/` : undefined;
      applyAssetSideEffects(project);
      await projectStore.save(project);
      return NextResponse.json({ ok: true, project, query });
    }

    const { image, query } = await searchPixabayImageWithFallback([...queries, fallback], kind);
    const mediaResponse = await fetch(image.largeImageURL, { signal: AbortSignal.timeout(120_000) });
    if (!mediaResponse.ok) throw new Error(`Pixabay 素材下载失败 (${mediaResponse.status})`);
    const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
    if (bytes.byteLength > 25 * 1024 * 1024) throw new Error("Pixabay 图片超过 25MB");
    const extension = image.largeImageURL.toLowerCase().includes(".png") ? "png" : "jpg";
    const contentType = extension === "png" ? "image/png" : "image/jpeg";
    const key = `projects/${id}/${sceneId}/pixabay-${image.id}.${extension}`;
    scene.assetUrl = await getStorage().put(key, bytes, contentType);
    scene.assetName = `pixabay-${image.id}.${extension}`;
    scene.assetKind = "IMAGE";
    scene.assetProvider = "PIXABAY";
    scene.sourceUrl = image.pageURL;
    scene.sourceAuthor = image.user;
    scene.sourceAuthorUrl = image.user ? `https://pixabay.com/users/${image.user}/` : undefined;
    applyAssetSideEffects(project);
    await projectStore.save(project);
    return NextResponse.json({ ok: true, project, query });
  } catch (error) {
    return apiError(error);
  }
}

function applyAssetSideEffects(project: Awaited<ReturnType<typeof projectStore.get>>) {
  if (!project) return;
  if (project.status === "REVIEW" || project.status === "EXPORTED") {
    project.status = "READY_TO_RENDER";
    project.outputUrl = undefined;
    project.outputDuration = undefined;
    project.renderProgress = 0;
  }
  project.updatedAt = new Date().toISOString();
}

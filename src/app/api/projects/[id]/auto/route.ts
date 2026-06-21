import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { buildPexelsQueries, searchPexelsVideoWithFallback } from "@/lib/pexels";
import { searchPixabayVideoWithFallback } from "@/lib/pixabay";
import { expandNarration } from "@/lib/providers/llm";
import { ensureRenderHistory, nextRenderVersion, renderProject } from "@/lib/render";
import { getStorage } from "@/lib/storage";
import { projectStore } from "@/lib/store";

type Context = { params: Promise<{ id: string }> };

export async function POST(_: Request, context: Context) {
  try {
    const { id } = await context.params;
    const project = await projectStore.get(id);
    if (!project) return NextResponse.json({ ok: false, error: "项目不存在" }, { status: 404 });

    project.status = "WAITING_ASSETS";
    project.renderProgress = 5;
    project.renderStage = "QUEUED";
    project.renderError = undefined;
    ensureRenderHistory(project);
    const version = nextRenderVersion(project);
    await projectStore.save(project);

    project.renderStage = "SCRIPT";
    await projectStore.save(project);
    const expanded = await expandNarration(project.scenes, project.duration);
    if (expanded) {
      project.scenes.forEach((scene, index) => {
        scene.narration = expanded[index];
        scene.subtitle = expanded[index];
      });
      project.script = expanded.join("");
      await projectStore.save(project);
    }

    project.renderStage = "ASSETS";
    await projectStore.save(project);
    const usedPexelsIds = new Set<number>();
    for (let index = 0; index < project.scenes.length; index++) {
      const scene = project.scenes[index];
      const existingPexelsId = scene.assetName?.match(/^(?:pexels|pixabay)-(\d+)\.mp4$/)?.[1];
      const isDuplicate = existingPexelsId ? usedPexelsIds.has(Number(existingPexelsId)) : false;
      if (!scene.assetUrl || isDuplicate) {
        const queries = buildPexelsQueries(scene.prompt, project.materialPreference ?? "CHINESE", index);
        let downloadUrl: string;
        let sourceUrl: string | undefined;
        let sourceAuthor: string | undefined;
        let sourceAuthorUrl: string | undefined;
        let assetName: string;
        let provider: "PEXELS" | "PIXABAY";
        let dedupeId: number;
        try {
          const { video, file } = await searchPexelsVideoWithFallback(queries, usedPexelsIds);
          downloadUrl = file.link;
          sourceUrl = video.url;
          sourceAuthor = video.user?.name;
          sourceAuthorUrl = video.user?.url;
          assetName = `pexels-${video.id}.mp4`;
          provider = "PEXELS";
          dedupeId = video.id;
        } catch (pexelsError) {
          // Pexels 没找到或未配置 key 时，回退到 Pixabay 视频。
          if (!process.env.PIXABAY_API_KEY) throw pexelsError;
          const { video, rendition } = await searchPixabayVideoWithFallback(queries, usedPexelsIds);
          downloadUrl = rendition.url;
          sourceUrl = video.pageURL;
          sourceAuthor = video.user;
          sourceAuthorUrl = video.user ? `https://pixabay.com/users/${video.user}/` : undefined;
          assetName = `pixabay-${video.id}.mp4`;
          provider = "PIXABAY";
          dedupeId = video.id;
        }
        const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(120_000) });
        if (!response.ok) throw new Error(`镜头 ${scene.order} 素材下载失败 (${response.status})`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const key = `projects/${id}/${scene.id}/auto-${provider.toLowerCase()}-${dedupeId}.mp4`;
        scene.assetUrl = await getStorage().put(key, bytes, "video/mp4");
        scene.assetName = assetName;
        scene.assetKind = "VIDEO";
        scene.assetProvider = provider;
        scene.sourceUrl = sourceUrl;
        scene.sourceAuthor = sourceAuthor;
        scene.sourceAuthorUrl = sourceAuthorUrl;
        usedPexelsIds.add(dedupeId);
      } else if (existingPexelsId) {
        usedPexelsIds.add(Number(existingPexelsId));
      }
      project.renderProgress = 5 + Math.round(((index + 1) / project.scenes.length) * 25);
      project.updatedAt = new Date().toISOString();
      await projectStore.save(project);
    }

    project.status = "RENDERING";
    project.renderStage = "NARRATION";
    await projectStore.save(project);
    const output = await renderProject(project, async (progress, stage) => {
      project.renderProgress = 30 + Math.round(progress * 0.7);
      if (stage) project.renderStage = stage;
      project.updatedAt = new Date().toISOString();
      await projectStore.save(project);
    }, version);
    project.renderOutputs = [...(project.renderOutputs ?? []), output];
    project.outputUrl = output.url;
    project.outputDuration = output.duration;
    project.status = "REVIEW";
    project.renderProgress = 100;
    project.renderStage = "DONE";
    project.updatedAt = new Date().toISOString();
    await projectStore.save(project);
    return NextResponse.json({ ok: true, project, message: `素材、旁白、字幕和第 ${output.version} 版 MP4 已生成，旧版本已保留。` });
  } catch (error) {
    const { id } = await context.params;
    const project = await projectStore.get(id);
    if (project) {
      project.status = project.scenes.some((scene) => scene.assetUrl) ? "WAITING_ASSETS" : "STORYBOARD_CONFIRMED";
      project.renderStage = undefined;
      project.renderError = error instanceof Error ? error.message : "一键生成失败";
      project.updatedAt = new Date().toISOString();
      await projectStore.save(project);
    }
    return apiError(error);
  }
}

import path from "node:path";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { searchJamendoTracks } from "@/lib/jamendo";
import { validateFileSignature, validateUpload } from "@/lib/schemas";
import { getStorage } from "@/lib/storage";
import { projectStore } from "@/lib/store";
import type { Project } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

// 设置/更换/移除背景音乐都会让已生成的成片失效，需重新渲染。
function invalidateOutput(project: Project) {
  if (project.status === "REVIEW" || project.status === "EXPORTED") {
    project.status = "READY_TO_RENDER";
    project.outputUrl = undefined;
    project.outputDuration = undefined;
    project.renderProgress = 0;
  }
  project.updatedAt = new Date().toISOString();
}

// GET ?q=... 搜索 Jamendo 配乐
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const tracks = await searchJamendoTracks(query, 12);
    return NextResponse.json({ ok: true, tracks });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const project = await projectStore.get(id);
    if (!project) return NextResponse.json({ ok: false, error: "项目不存在" }, { status: 404 });
    const contentType = request.headers.get("content-type") ?? "";

    // 上传本地 BGM（含从 Mixkit / YouTube 音频库下载后的文件）
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "请选择音频文件" }, { status: 400 });
      const validated = validateUpload(file);
      if (validated.kind !== "AUDIO") return NextResponse.json({ ok: false, error: "请上传 MP3 / WAV 音频" }, { status: 400 });
      const bytes = new Uint8Array(await file.arrayBuffer());
      validateFileSignature(bytes, file.type);
      const safeName = `music-${Date.now()}${path.extname(file.name).toLowerCase()}`;
      const key = `projects/${id}/music/${safeName}`;
      project.musicUrl = await getStorage().put(key, bytes, file.type);
      project.musicName = file.name.slice(0, 180);
      project.musicProvider = "UPLOAD";
      project.musicSourceUrl = undefined;
      invalidateOutput(project);
      await projectStore.save(project);
      return NextResponse.json({ ok: true, project });
    }

    const body = await request.json().catch(() => ({}));

    if (body.clear === true) {
      project.musicUrl = undefined;
      project.musicName = undefined;
      project.musicProvider = undefined;
      project.musicSourceUrl = undefined;
      invalidateOutput(project);
      await projectStore.save(project);
      return NextResponse.json({ ok: true, project });
    }

    if (typeof body.volume === "number" && !body.audioUrl) {
      project.musicVolume = Math.min(1, Math.max(0, body.volume));
      project.updatedAt = new Date().toISOString();
      await projectStore.save(project);
      return NextResponse.json({ ok: true, project });
    }

    // 选用 Jamendo 配乐：下载到本地存储，渲染时再混入。
    if (typeof body.audioUrl === "string" && body.audioUrl.startsWith("http")) {
      const response = await fetch(body.audioUrl, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`配乐下载失败 (${response.status})`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 50 * 1024 * 1024) throw new Error("配乐文件超过 50MB");
      const trackId = String(body.trackId ?? Date.now());
      const key = `projects/${id}/music/jamendo-${trackId}.mp3`;
      project.musicUrl = await getStorage().put(key, bytes, "audio/mpeg");
      project.musicName = typeof body.name === "string" ? body.name.slice(0, 180) : `Jamendo ${trackId}`;
      project.musicProvider = "JAMENDO";
      project.musicSourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl : undefined;
      if (typeof body.volume === "number") project.musicVolume = Math.min(1, Math.max(0, body.volume));
      invalidateOutput(project);
      await projectStore.save(project);
      return NextResponse.json({ ok: true, project });
    }

    return NextResponse.json({ ok: false, error: "缺少有效的配乐参数" }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}

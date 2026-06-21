import type { MaterialPreference } from "@/lib/types";

export interface PexelsVideoFile {
  width: number;
  height: number;
  link: string;
  quality?: string;
  file_type?: string;
}

export interface PexelsVideo {
  id: number;
  duration: number;
  url: string;
  user?: { name?: string; url?: string };
  video_files: PexelsVideoFile[];
}

const ignoredWords = new Set([
  "realistic", "cinematic", "lighting", "natural", "soft", "shallow",
  "depth", "field", "slight", "expression", "close", "up", "medium",
  "at", "the", "a", "an", "of", "and", "with",
]);

export function buildPexelsQuery(prompt: string) {
  return prompt
    .split(/[^a-zA-Z]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 1 && !ignoredWords.has(word.toLowerCase()))
    .slice(0, 6)
    .join(" ");
}

export function buildPexelsQueries(prompt: string, preference: MaterialPreference = "CHINESE", order = 0) {
  const lower = prompt.toLowerCase();
  const isMan = /\bman\b|\bmale\b|\bfather\b|\bboy\b/.test(lower) && !/\bwoman\b|\bfemale\b/.test(lower);
  const isStreet = /street|city|outdoor|walking|road/.test(lower);
  const isOffice = /office|team|meeting|desk|work/.test(lower);
  const isHome = /home|room|sofa|bed|kitchen/.test(lower);
  const isPortrait = /portrait|face|close|tear|sad|smile|worried/.test(lower);
  const base = buildPexelsQuery(prompt);

  if (preference === "SCENERY") {
    const scenery = isStreet
      ? ["beijing street", "shanghai street", "china street"]
      : isOffice
        ? ["modern office interior", "office desk hands working"]
        : isHome
          ? ["cozy home interior", "window night city"]
          : ["china city scenery", "chinese tea close up", "urban night window"];
    return [...scenery, base, "cinematic objects close up"];
  }

  if (preference === "GLOBAL") {
    return [
      base,
      isMan ? "man emotional portrait" : "woman emotional portrait",
      isStreet ? "city street lifestyle" : "",
      isOffice ? "office teamwork" : "",
      isHome ? "woman home thoughtful" : "",
      "people lifestyle portrait",
    ].filter(Boolean);
  }

  const person = isMan ? "chinese man" : "chinese woman";
  const contextual = [
    isStreet ? (order % 2 ? "shanghai street" : "beijing street") : "",
    isOffice ? `${person} office` : "",
    isHome ? `${person} home` : "",
    isPortrait ? `${person} portrait` : "",
  ].filter(Boolean);
  return [
    ...contextual,
    `${person} ${base}`.trim(),
    "chinese portrait",
    "chinese woman daily life",
    "china street",
    "beijing street",
    "shanghai street",
  ];
}

export function choosePexelsVideoFile(files: PexelsVideoFile[]) {
  return files
    .filter((file) => file.width >= 540 && file.height >= 540)
    .sort((a, b) => {
      const aPortraitPenalty = a.height > a.width ? 0 : 3000;
      const bPortraitPenalty = b.height > b.width ? 0 : 3000;
      const aScore = aPortraitPenalty + Math.abs(a.width / a.height - 9 / 16) * 1000 + Math.abs(a.width - 1080);
      const bScore = bPortraitPenalty + Math.abs(b.width / b.height - 9 / 16) * 1000 + Math.abs(b.width - 1080);
      return aScore - bScore;
    })[0] ?? null;
}

export async function searchPexelsVideo(query: string, minimumDuration: number, excludedIds = new Set<number>()) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error("未配置 PEXELS_API_KEY");
  const url = new URL("https://api.pexels.com/videos/search");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "portrait");
  url.searchParams.set("size", "medium");
  url.searchParams.set("per_page", "30");
  const response = await fetch(url, {
    headers: { Authorization: apiKey },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Pexels 搜索失败 (${response.status})`);
  const data = await response.json() as { videos?: PexelsVideo[] };
  for (const video of data.videos ?? []) {
    if (excludedIds.has(video.id)) continue;
    if (video.duration < minimumDuration) continue;
    const file = choosePexelsVideoFile(video.video_files);
    if (file) return { video, file };
  }
  throw new Error("没有找到合适的竖屏 Pexels 素材");
}

export async function searchPexelsVideoWithFallback(queries: string[], excludedIds = new Set<number>()) {
  let lastError: unknown;
  for (const query of [...new Set(queries.map((item) => item.trim()).filter(Boolean))]) {
    try {
      return { ...(await searchPexelsVideo(query, 2, excludedIds)), query };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("没有找到合适的 Pexels 素材");
}

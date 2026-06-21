export interface PixabayVideoRendition {
  url: string;
  width: number;
  height: number;
}

export interface PixabayVideo {
  id: number;
  pageURL: string;
  duration: number;
  videos: Record<string, PixabayVideoRendition>;
  user?: string;
  tags?: string;
}

export interface PixabayImage {
  id: number;
  pageURL: string;
  tags?: string;
  webformatURL?: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  user?: string;
}

export type PixabayImageType = "illustration" | "photo";

function pixabayKey() {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) throw new Error("未配置 PIXABAY_API_KEY");
  return key;
}

// 与 Pexels 一致地优先竖屏、接近 1080×1920 的画面。
export function choosePixabayVideoRendition(videos: Record<string, PixabayVideoRendition>) {
  return Object.values(videos)
    .filter((rendition) => rendition.url && rendition.width >= 540 && rendition.height >= 540)
    .sort((a, b) => {
      const aPortraitPenalty = a.height > a.width ? 0 : 3000;
      const bPortraitPenalty = b.height > b.width ? 0 : 3000;
      const aScore = aPortraitPenalty + Math.abs(a.width / a.height - 9 / 16) * 1000 + Math.abs(a.width - 1080);
      const bScore = bPortraitPenalty + Math.abs(b.width / b.height - 9 / 16) * 1000 + Math.abs(b.width - 1080);
      return aScore - bScore;
    })[0] ?? null;
}

export async function searchPixabayVideo(query: string, minimumDuration: number, excludedIds = new Set<number>()) {
  const url = new URL("https://pixabay.com/api/videos/");
  url.searchParams.set("key", pixabayKey());
  url.searchParams.set("q", query);
  url.searchParams.set("per_page", "30");
  url.searchParams.set("safesearch", "true");
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Pixabay 视频搜索失败 (${response.status})`);
  const data = await response.json() as { hits?: PixabayVideo[] };
  for (const video of data.hits ?? []) {
    if (excludedIds.has(video.id)) continue;
    if (video.duration < minimumDuration) continue;
    const rendition = choosePixabayVideoRendition(video.videos);
    if (rendition && rendition.height >= rendition.width) return { video, rendition };
  }
  throw new Error("没有找到合适的竖屏 Pixabay 视频");
}

export async function searchPixabayVideoWithFallback(queries: string[], excludedIds = new Set<number>()) {
  let lastError: unknown;
  for (const query of [...new Set(queries.map((item) => item.trim()).filter(Boolean))]) {
    try {
      return { ...(await searchPixabayVideo(query, 2, excludedIds)), query };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("没有找到合适的 Pixabay 视频");
}

export async function searchPixabayImage(query: string, imageType: PixabayImageType, excludedIds = new Set<number>()) {
  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", pixabayKey());
  url.searchParams.set("q", query);
  url.searchParams.set("image_type", imageType);
  url.searchParams.set("orientation", "vertical");
  url.searchParams.set("per_page", "30");
  url.searchParams.set("safesearch", "true");
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Pixabay 图片搜索失败 (${response.status})`);
  const data = await response.json() as { hits?: PixabayImage[] };
  for (const image of data.hits ?? []) {
    if (excludedIds.has(image.id)) continue;
    if (image.largeImageURL) return image;
  }
  throw new Error(imageType === "illustration" ? "没有找到合适的 Pixabay 插画" : "没有找到合适的 Pixabay 图片");
}

export async function searchPixabayImageWithFallback(
  queries: string[],
  imageType: PixabayImageType,
  excludedIds = new Set<number>(),
) {
  let lastError: unknown;
  for (const query of [...new Set(queries.map((item) => item.trim()).filter(Boolean))]) {
    try {
      return { image: await searchPixabayImage(query, imageType, excludedIds), query };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("没有找到合适的 Pixabay 图片");
}

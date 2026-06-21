export interface FreesoundClip {
  id: number;
  name: string;
  username: string;
  pageUrl: string;
  previewUrl: string;
  duration: number;
}

interface FreesoundApiResult {
  id: number;
  name: string;
  username: string;
  url: string;
  duration: number;
  previews?: Record<string, string>;
}

// Freesound 提供海量音效，token 模式可直接拿到 preview 试听/下载地址。
export async function searchFreesound(query: string, pageSize = 15): Promise<FreesoundClip[]> {
  const token = process.env.FREESOUND_API_KEY;
  if (!token) throw new Error("未配置 FREESOUND_API_KEY");
  const url = new URL("https://freesound.org/apiv2/search/text/");
  url.searchParams.set("query", query);
  url.searchParams.set("token", token);
  url.searchParams.set("fields", "id,name,previews,username,url,duration");
  url.searchParams.set("page_size", String(Math.min(50, Math.max(1, pageSize))));
  url.searchParams.set("filter", "duration:[0 TO 30]");
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Freesound 搜索失败 (${response.status})`);
  const data = await response.json() as { results?: FreesoundApiResult[] };
  return (data.results ?? [])
    .map((result) => ({
      id: result.id,
      name: result.name,
      username: result.username,
      pageUrl: result.url,
      previewUrl: result.previews?.["preview-hq-mp3"] ?? result.previews?.["preview-lq-mp3"] ?? "",
      duration: Number(result.duration) || 0,
    }))
    .filter((clip) => clip.previewUrl);
}

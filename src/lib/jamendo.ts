export interface JamendoTrack {
  id: string;
  name: string;
  artistName: string;
  audioUrl: string;
  shareUrl: string;
  duration: number;
  image?: string;
}

interface JamendoApiTrack {
  id: number | string;
  name: string;
  artist_name: string;
  audio: string;
  shareurl: string;
  duration: number | string;
  image?: string;
}

// Jamendo 提供免费可商用的配乐，需要免费的 client_id。
export async function searchJamendoTracks(query: string, limit = 12): Promise<JamendoTrack[]> {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) throw new Error("未配置 JAMENDO_CLIENT_ID");
  const url = new URL("https://api.jamendo.com/v3.0/tracks/");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(Math.min(50, Math.max(1, limit))));
  url.searchParams.set("audioformat", "mp32");
  url.searchParams.set("order", "popularity_total");
  url.searchParams.set("include", "musicinfo");
  const trimmed = query.trim();
  if (trimmed) {
    url.searchParams.set("search", trimmed);
    url.searchParams.set("fuzzytags", trimmed.split(/\s+/).slice(0, 4).join(" "));
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Jamendo 搜索失败 (${response.status})`);
  const data = await response.json() as { results?: JamendoApiTrack[] };
  return (data.results ?? [])
    .filter((track) => track.audio)
    .map((track) => ({
      id: String(track.id),
      name: track.name,
      artistName: track.artist_name,
      audioUrl: track.audio,
      shareUrl: track.shareurl,
      duration: Number(track.duration) || 0,
      image: track.image,
    }));
}

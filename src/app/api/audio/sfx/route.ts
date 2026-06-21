import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { searchFreesound } from "@/lib/freesound";

// GET ?q=... 搜索 Freesound 音效（返回 preview 试听/下载地址）
export async function GET(request: Request) {
  try {
    const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
    if (!query) return NextResponse.json({ ok: false, error: "请输入搜索词" }, { status: 400 });
    const clips = await searchFreesound(query, 15);
    return NextResponse.json({ ok: true, clips });
  } catch (error) {
    return apiError(error);
  }
}

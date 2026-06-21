import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

type Context = { params: Promise<{ path: string[] }> };

export async function GET(_: Request, context: Context) {
  const parts = (await context.params).path;
  const root = path.resolve(process.cwd(), "storage");
  const target = path.resolve(root, ...parts);
  if (!target.startsWith(root + path.sep)) return NextResponse.json({ error: "非法路径" }, { status: 400 });
  try {
    const bytes = await readFile(target);
    const extension = path.extname(target).toLowerCase();
    const types: Record<string, string> = {
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
      ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".wav": "audio/wav",
    };
    return new NextResponse(bytes, { headers: { "Content-Type": types[extension] ?? "application/octet-stream", "Cache-Control": "private, max-age=3600" } });
  } catch {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
}

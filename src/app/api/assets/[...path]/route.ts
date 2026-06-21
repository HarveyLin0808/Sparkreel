import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

type Context = { params: Promise<{ path: string[] }> };

export async function GET(_: Request, context: Context) {
  const parts = (await context.params).path;
  if (parts.some((part) => part === ".." || part.includes("\\"))) {
    return NextResponse.json({ error: "非法路径" }, { status: 400 });
  }
  try {
    const key = parts.join("/");
    const bytes = await getStorage().get(key);
    const extension = parts.at(-1)?.split(".").at(-1)?.toLowerCase();
    const types: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
      mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav",
    };
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": types[extension ?? ""] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
}

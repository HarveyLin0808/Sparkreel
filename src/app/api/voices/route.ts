import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";

const voices = [
  { id: "zh-CN-XiaoyiNeural", label: "晓伊 · 温柔女声" },
  { id: "zh-CN-XiaoxiaoNeural", label: "晓晓 · 自然女声" },
  { id: "zh-CN-liaoning-XiaobeiNeural", label: "晓北 · 东北女声" },
  { id: "zh-CN-shaanxi-XiaoniNeural", label: "晓妮 · 陕西女声" },
  { id: "zh-CN-YunxiNeural", label: "云希 · 青年男声" },
  { id: "zh-CN-YunyangNeural", label: "云扬 · 新闻男声" },
  { id: "zh-CN-YunjianNeural", label: "云健 · 成熟男声" },
  { id: "zh-CN-YunxiaNeural", label: "云夏 · 少年男声" },
] as const;

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`语音试听生成失败: ${stderr.slice(-500)}`)));
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, voices });
}

export async function POST(request: Request) {
  let temp = "";
  try {
    const body = await request.json();
    const voice = voices.find((item) => item.id === body.voiceName)?.id;
    if (!voice) return NextResponse.json({ ok: false, error: "不支持的声音" }, { status: 400 });
    const edgeTts = process.env.EDGE_TTS_PATH;
    if (!edgeTts) throw new Error("未配置 EDGE_TTS_PATH");
    temp = await mkdtemp(path.join(os.tmpdir(), "sparkreel-voice-"));
    const textFile = path.join(temp, "preview.txt");
    const audioFile = path.join(temp, "preview.mp3");
    await writeFile(textFile, "愿你的表达被听见，也愿每一句话都保留真实的温度。", "utf8");
    await run(edgeTts, [
      "-f", textFile,
      "-v", voice,
      `--rate=${/^[+-]\d+%$/.test(body.voiceRate) ? body.voiceRate : "-5%"}`,
      "--write-media", audioFile,
    ]);
    const audio = await readFile(audioFile);
    return new NextResponse(audio, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  } finally {
    if (temp) await rm(temp, { recursive: true, force: true });
  }
}

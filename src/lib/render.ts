import { mkdir, writeFile, readFile, copyFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { buildSrt } from "@/lib/content";
import type { Project, RenderOutput } from "@/lib/types";
import { getStorage } from "@/lib/storage";
import { edgeSrtToAss } from "@/lib/subtitles";

function run(command: string, args: string[], stdin?: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} 失败 (${code}): ${stderr.slice(-1000)}`)));
    if (stdin) child.stdin.end(stdin);
    else child.stdin.end();
  });
}

function runWithOutput(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(`${command} 失败 (${code}): ${stderr.slice(-1000)}`)));
  });
}

export function resolveRenderDuration(projectDuration: number, narrationDuration?: number, tailPadding = 3) {
  return Math.max(projectDuration, Math.ceil((narrationDuration ?? 0) + tailPadding));
}

export function safeVideoFileName(title: string, version: number) {
  const safeTitle = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/[.\s]+$/g, "")
    .trim()
    .slice(0, 80) || "video";
  return `${safeTitle}-${version}.mp4`;
}

export function ensureRenderHistory(project: Project) {
  project.renderOutputs ??= [];
  if (project.outputUrl && !project.renderOutputs.some((output) => output.url === project.outputUrl)) {
    const version = Math.max(0, ...project.renderOutputs.map((output) => output.version)) + 1;
    project.renderOutputs.push({
      version,
      url: project.outputUrl,
      fileName: safeVideoFileName(project.title, version),
      duration: project.outputDuration ?? project.duration,
      createdAt: project.updatedAt,
    });
  }
  return project.renderOutputs;
}

export function nextRenderVersion(project: Project) {
  const outputs = ensureRenderHistory(project);
  return Math.max(0, ...outputs.map((output) => output.version)) + 1;
}

async function getMediaDuration(ffmpeg: string, file: string) {
  const ffprobe = path.join(path.dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  const output = await runWithOutput(ffprobe, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const duration = Number(output);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("无法读取旁白时长");
  return duration;
}

async function generateWindowsNarration(text: string, output: string) {
  const encoded = Buffer.from(text, "utf8").toString("base64");
  const safeOutput = output.replace(/'/g, "''");
  const script = [
    "Add-Type -AssemblyName System.Speech",
    "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    "$voice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'zh-CN' } | Select-Object -First 1",
    "if ($voice) { $synth.SelectVoice($voice.VoiceInfo.Name) }",
    "$synth.Rate = -3",
    `$text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))`,
    `$synth.SetOutputToWaveFile('${safeOutput}')`,
    "$synth.Speak($text)",
    "$synth.Dispose()",
  ].join("; ");
  await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
}

async function generateEdgeNarration(text: string, workDir: string, voiceName?: string, voiceRate?: string) {
  const edgeTts = process.env.EDGE_TTS_PATH;
  if (!edgeTts) return null;
  const textFile = path.join(workDir, "narration.txt");
  const audioFile = path.join(workDir, "narration.mp3");
  const subtitleFile = path.join(workDir, "edge.srt");
  await writeFile(textFile, text, "utf8");
  await run(edgeTts, [
    "-f", textFile,
    "-v", voiceName ?? process.env.EDGE_TTS_VOICE ?? "zh-CN-XiaoyiNeural",
    `--rate=${voiceRate ?? process.env.EDGE_TTS_RATE ?? "-5%"}`,
    "--write-media", audioFile,
    "--write-subtitles", subtitleFile,
  ]);
  return { audioFile, subtitleFile };
}

async function materialize(url: string, target: string) {
  if (url.startsWith("/api/assets/")) {
    const key = url.replace("/api/assets/", "");
    await writeFile(target, await getStorage().get(key));
    return;
  }
  if (url.startsWith("/api/media/")) {
    const relative = url.replace("/api/media/", "").split("/").join(path.sep);
    await copyFile(path.join(process.cwd(), "storage", relative), target);
    return;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`素材下载失败 (${response.status})`);
  await writeFile(target, new Uint8Array(await response.arrayBuffer()));
}

export async function renderProject(
  project: Project,
  onProgress: (progress: number) => Promise<void>,
  version = nextRenderVersion(project),
): Promise<RenderOutput> {
  const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
  const root = path.join(process.cwd(), "storage", "renders", project.id);
  const temp = path.join(root, "work");
  await mkdir(temp, { recursive: true });
  let narration = path.join(temp, "narration.wav");
  let subtitleSrt = buildSrt(project.scenes);
  let hasNarration = false;
  const edgeNarration = await generateEdgeNarration(project.script, temp, project.voiceName, project.voiceRate);
  if (edgeNarration) {
    narration = edgeNarration.audioFile;
    subtitleSrt = await readFile(edgeNarration.subtitleFile, "utf8");
    hasNarration = true;
  } else {
    const piper = process.env.PIPER_PATH;
    const piperModel = process.env.PIPER_MODEL;
    if (piper && piperModel) {
      await run(piper, ["--model", piperModel, "--output_file", narration], project.script);
      hasNarration = true;
    } else if (process.platform === "win32") {
      await generateWindowsNarration(project.script, narration);
      hasNarration = true;
    }
  }
  const narrationDuration = hasNarration ? await getMediaDuration(ffmpeg, narration) : undefined;
  const renderDuration = resolveRenderDuration(project.duration, narrationDuration);
  project.outputDuration = renderDuration;
  const sceneDurations = project.scenes.map((scene) => scene.duration);
  const visualDuration = sceneDurations.reduce((sum, value) => sum + value, 0);
  if (renderDuration > visualDuration && sceneDurations.length) {
    sceneDurations[sceneDurations.length - 1] += renderDuration - visualDuration;
  }
  if (!edgeNarration && renderDuration > project.duration) {
    subtitleSrt = buildSrt(project.scenes.map((scene, index) => ({ ...scene, duration: sceneDurations[index] })));
  }
  await onProgress(10);

  const inputs: string[] = [];
  const filters: string[] = [];

  for (let index = 0; index < project.scenes.length; index++) {
    const scene = project.scenes[index];
    const sceneDuration = sceneDurations[index];
    if (!scene.assetUrl) throw new Error(`分镜 ${scene.order} 缺少素材`);
    const extension = scene.assetKind === "VIDEO" ? ".mp4" : ".png";
    const file = path.join(temp, `scene-${index}${extension}`);
    await materialize(scene.assetUrl, file);
    if (scene.assetKind === "VIDEO") inputs.push("-stream_loop", "-1", "-t", String(sceneDuration), "-i", file);
    else inputs.push("-loop", "1", "-t", String(sceneDuration), "-i", file);
    filters.push(
      `[${index}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,fade=t=in:st=0:d=0.25,fade=t=out:st=${Math.max(sceneDuration - 0.25, 0)}:d=0.25[v${index}]`,
    );
    await onProgress(15 + Math.round((index / project.scenes.length) * 30));
  }

  const joined = project.scenes.map((_, index) => `[v${index}]`).join("");
  filters.push(`${joined}concat=n=${project.scenes.length}:v=1:a=0[video]`);
  const baseVideo = path.join(temp, "base.mp4");
  await run(ffmpeg, [
    "-y", ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", "[video]", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    baseVideo,
  ]);
  await onProgress(55);

  const subtitleFile = path.join(temp, "captions.ass");
  await writeFile(subtitleFile, edgeSrtToAss(subtitleSrt), "utf8");
  const subtitled = path.join(temp, "subtitled.mp4");
  const subtitlePath = subtitleFile.replace(/\\/g, "/").replace(":", "\\:");
  await run(ffmpeg, [
    "-y", "-i", baseVideo,
    "-vf", `subtitles='${subtitlePath}'`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-an", subtitled,
  ]);
  await onProgress(70);

  const fileName = safeVideoFileName(project.title, version);
  const output = path.join(root, fileName);
  if (hasNarration) {
    await run(ffmpeg, [
      "-y", "-i", subtitled, "-i", narration,
      "-filter:a", "loudnorm=I=-16:TP=-1.5:LRA=11,apad",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", String(renderDuration), output,
    ]);
  } else {
    await copyFile(subtitled, output);
  }
  await onProgress(100);
  await rm(temp, { recursive: true, force: true });
  return {
    version,
    url: `/api/media/renders/${project.id}/${encodeURIComponent(fileName)}`,
    fileName,
    duration: renderDuration,
    createdAt: new Date().toISOString(),
  };
}

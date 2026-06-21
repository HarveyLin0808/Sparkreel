import { z } from "zod";
import type { MediaKind } from "@/lib/types";

export const createProjectSchema = z.object({
  input: z.string().trim().min(2, "请输入至少 2 个字符").max(12000, "内容不能超过 12000 个字符"),
  audience: z.string().trim().max(120).default("25-35 岁、有情绪压力的职场人"),
  tone: z.string().trim().max(120).default("克制、真诚、温暖"),
  avoid: z.string().trim().max(500).default("说教、夸张承诺、制造焦虑、真人身份仿冒"),
  duration: z.number().int().min(30).max(90).default(90),
  visualStyle: z.enum(["CARTOON", "COMIC", "ASIAN_REALISTIC"]).default("ASIAN_REALISTIC"),
  voiceName: z.string().trim().max(100).default("zh-CN-XiaoyiNeural"),
  voiceRate: z.string().regex(/^[+-]\d+%$/, "语速格式无效").default("-5%"),
  materialPreference: z.enum(["CHINESE", "GLOBAL", "SCENERY"]).default("CHINESE"),
});

export const updateSceneSchema = z.object({
  narration: z.string().trim().min(1).max(1000).optional(),
  subtitle: z.string().trim().min(1).max(300).optional(),
  duration: z.number().int().min(2).max(20).optional(),
  composition: z.string().trim().min(1).max(500).optional(),
  motion: z.string().trim().min(1).max(300).optional(),
  prompt: z.string().trim().min(1).max(2000).optional(),
  negativePrompt: z.string().trim().min(1).max(1000).optional(),
});

const fileRules: Record<string, { extensions: string[]; kind: MediaKind; max: number }> = {
  "image/jpeg": { extensions: [".jpg", ".jpeg"], kind: "IMAGE", max: 25 * 1024 * 1024 },
  "image/png": { extensions: [".png"], kind: "IMAGE", max: 25 * 1024 * 1024 },
  "image/webp": { extensions: [".webp"], kind: "IMAGE", max: 25 * 1024 * 1024 },
  "video/mp4": { extensions: [".mp4"], kind: "VIDEO", max: 250 * 1024 * 1024 },
  "video/webm": { extensions: [".webm"], kind: "VIDEO", max: 250 * 1024 * 1024 },
  "audio/mpeg": { extensions: [".mp3"], kind: "AUDIO", max: 50 * 1024 * 1024 },
  "audio/wav": { extensions: [".wav"], kind: "AUDIO", max: 50 * 1024 * 1024 },
};

export function validateUpload(file: { name: string; type: string; size: number }) {
  const rule = fileRules[file.type];
  if (!rule) throw new Error("不支持此文件类型");
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!extension || !rule.extensions.includes(extension)) throw new Error("文件扩展名与类型不匹配");
  if (file.size <= 0 || file.size > rule.max) throw new Error("文件为空或超过大小限制");
  return { kind: rule.kind, extension };
}

export function validateFileSignature(bytes: Uint8Array, type: string) {
  const startsWith = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  const valid =
    (type === "image/jpeg" && startsWith(0xff, 0xd8, 0xff)) ||
    (type === "image/png" && startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) ||
    (type === "image/webp" && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") ||
    (type === "video/mp4" && ascii(4, 4) === "ftyp") ||
    (type === "video/webm" && startsWith(0x1a, 0x45, 0xdf, 0xa3)) ||
    (type === "audio/mpeg" && (startsWith(0x49, 0x44, 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))) ||
    (type === "audio/wav" && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE");
  if (!valid) throw new Error("文件内容与声明类型不匹配");
}

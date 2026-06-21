export const PROJECT_STATUSES = [
  "DRAFT",
  "SCRIPT_CONFIRMED",
  "STORYBOARD_CONFIRMED",
  "WAITING_ASSETS",
  "READY_TO_RENDER",
  "RENDERING",
  "REVIEW",
  "EXPORTED",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type VisualStyle = "CARTOON" | "COMIC" | "ASIAN_REALISTIC";
export type MaterialPreference = "CHINESE" | "GLOBAL" | "SCENERY";
export type MediaKind = "IMAGE" | "VIDEO" | "AUDIO";
export type Platform = "DOUYIN" | "XIAOHONGSHU" | "WECHAT_CHANNELS";

export interface ProjectInput {
  input: string;
  audience?: string;
  tone?: string;
  avoid?: string;
  duration: number;
  visualStyle: VisualStyle;
  voiceName?: string;
  voiceRate?: string;
  materialPreference?: MaterialPreference;
}

export interface ContentAngle {
  id: string;
  title: string;
  hook: string;
  coreMessage: string;
}

export interface Scene {
  id: string;
  order: number;
  duration: number;
  narration: string;
  subtitle: string;
  composition: string;
  motion: string;
  prompt: string;
  negativePrompt: string;
  assetUrl?: string;
  assetName?: string;
  assetKind?: MediaKind;
  assetProvider?: "UPLOAD" | "AI" | "PEXELS";
  sourceUrl?: string;
  sourceAuthor?: string;
  sourceAuthorUrl?: string;
}

export interface PlatformCopy {
  platform: Platform;
  title: string;
  body: string;
  tags: string[];
}

export interface ContentPlan {
  angles: ContentAngle[];
  selectedAngleId: string;
  title: string;
  hook: string;
  script: string;
  scenes: Scene[];
  platformCopies: PlatformCopy[];
}

export interface RenderOutput {
  version: number;
  url: string;
  fileName: string;
  duration: number;
  createdAt: string;
}

export interface Project extends ProjectInput, ContentPlan {
  id: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  renderProgress: number;
  renderError?: string;
  outputUrl?: string;
  outputDuration?: number;
  renderOutputs?: RenderOutput[];
}

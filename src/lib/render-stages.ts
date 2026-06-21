export const RENDER_STAGE_KEYS = [
  "QUEUED",
  "SCRIPT",
  "ASSETS",
  "NARRATION",
  "SCENES",
  "CONCAT",
  "SUBTITLES",
  "MUX",
  "DONE",
] as const;

export type RenderStageKey = (typeof RENDER_STAGE_KEYS)[number];

export interface RenderStageDef {
  key: RenderStageKey;
  label: string;
  hint: string;
}

// 视频生成的步骤顺序，前端据此渲染步骤列表与高亮当前步骤。
export const RENDER_STAGES: RenderStageDef[] = [
  { key: "QUEUED", label: "准备生成", hint: "初始化任务与版本" },
  { key: "SCRIPT", label: "扩写旁白脚本", hint: "AI 补全每个镜头的口播" },
  { key: "ASSETS", label: "匹配视频素材", hint: "检索并下载分镜画面" },
  { key: "NARRATION", label: "生成配音旁白", hint: "合成语音与字幕时间轴" },
  { key: "SCENES", label: "处理分镜画面", hint: "裁剪缩放每个镜头" },
  { key: "CONCAT", label: "拼接视频片段", hint: "按顺序合并所有镜头" },
  { key: "SUBTITLES", label: "烧录动态字幕", hint: "叠加字幕样式" },
  { key: "MUX", label: "合成配音并导出", hint: "输出最终 MP4 成片" },
  { key: "DONE", label: "生成完成", hint: "等待预览与审核" },
];

export function renderStageIndex(stage?: RenderStageKey) {
  if (!stage) return 0;
  const index = RENDER_STAGES.findIndex((item) => item.key === stage);
  return index < 0 ? 0 : index;
}

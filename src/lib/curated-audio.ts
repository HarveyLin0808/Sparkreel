export interface CuratedSource {
  name: string;
  kind: "音乐" | "音效" | "视频";
  license: string;
  url: string;
  note: string;
}

// Mixkit 与 YouTube Audio Library 没有公开 API，无法自动接入。
// 这里提供官方直达入口，方便手动下载后再上传。
export const CURATED_SOURCES: CuratedSource[] = [
  {
    name: "Mixkit · 免费配乐",
    kind: "音乐",
    license: "Mixkit License · 免费可商用 · 无需署名",
    url: "https://mixkit.co/free-stock-music/",
    note: "镜头感配乐与情绪 BGM，下载后用上方“上传背景音乐”加入",
  },
  {
    name: "Mixkit · 免费音效",
    kind: "音效",
    license: "Mixkit License · 免费可商用 · 无需署名",
    url: "https://mixkit.co/free-sound-effects/",
    note: "转场 / 环境 / UI 音效",
  },
  {
    name: "Mixkit · 镜头感空镜",
    kind: "视频",
    license: "Mixkit License · 免费可商用 · 无需署名",
    url: "https://mixkit.co/free-stock-video/",
    note: "电影感空镜，下载后按分镜上传画面",
  },
  {
    name: "YouTube 音频库",
    kind: "音乐",
    license: "登录 YouTube Studio 下载 · 注意单曲署名要求",
    url: "https://studio.youtube.com/",
    note: "进入 Studio → 左侧“音频库”，下载后用“上传背景音乐”加入",
  },
];

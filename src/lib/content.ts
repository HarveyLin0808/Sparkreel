import type { ContentPlan, PlatformCopy, ProjectInput, Scene, VisualStyle } from "@/lib/types";

const stylePrompt: Record<VisualStyle, string> = {
  CARTOON: "高级二维卡通动画，柔和色彩，人物表情细腻，竖屏构图",
  COMIC: "电影感国风漫画，清晰线稿，情绪化光影，分镜叙事，竖屏构图",
  ASIAN_REALISTIC: "亚洲面庞成年人物，电影级写实摄影，自然皮肤质感，克制情绪，竖屏构图",
};

const beats = [
  ["冲突钩子", "你有没有发现，越是习惯说“没事”的人，越容易在某个普通的夜晚突然撑不住。"],
  ["具体场景", "白天把每件事都处理得体，回复每一句“收到”，却在回家的电梯里一句话也不想说。"],
  ["内心真相", "不是你不够坚强，而是你已经太久没有允许自己被照顾。"],
  ["共鸣推进", "懂事让你避开了很多冲突，也让别人慢慢忘记，你同样会累、会疼、会需要回应。"],
  ["认知转折", "真正成熟，不是永远稳定，而是能承认自己的感受，不再把所有委屈都解释成应该。"],
  ["行动建议", "下次想说“没关系”之前，停一秒，问问自己：这真的是我愿意的吗？"],
  ["情绪收束", "你可以温柔，也可以有边界；可以照顾别人，也可以先接住自己。"],
  ["余韵结尾", "愿你不必靠沉默证明懂事，也有人看见你没有说出口的那句：其实我也需要被爱。"],
] as const;

function distributeDuration(total: number, count: number) {
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function buildPlatformCopies(title: string, script: string): PlatformCopy[] {
  const summary = script.slice(0, 90);
  return [
    {
      platform: "DOUYIN",
      title,
      body: `${summary}\n愿每一个习惯逞强的人，都能先照顾好自己。`,
      tags: ["情绪共鸣", "治愈", "成年人"],
    },
    {
      platform: "XIAOHONGSHU",
      title: `原来，${title}`,
      body: `${summary}\n\n有些懂事并不是天生，而是很早就学会了不麻烦别人。请允许自己偶尔不坚强。`,
      tags: ["情绪疗愈", "自我成长", "生活感悟"],
    },
    {
      platform: "WECHAT_CHANNELS",
      title,
      body: `${summary}\n把这段话送给一直默默撑着的你。`,
      tags: ["情感", "成长", "共鸣"],
    },
  ];
}

export function buildDemoPlan(input: ProjectInput): ContentPlan {
  const subject = input.input.replace(/\s+/g, " ").slice(0, 80);
  const angles = [
    { id: "angle-1", title: "越懂事，越容易被忽略", hook: "那些总说没事的人，可能最需要一句你还好吗。", coreMessage: "看见懂事背后的压抑。" },
    { id: "angle-2", title: "成年人崩溃前的安静", hook: "真正的崩溃，往往没有声音。", coreMessage: "允许脆弱是一种成熟。" },
    { id: "angle-3", title: "别再用沉默证明坚强", hook: "你不必把所有委屈都咽下去。", coreMessage: "温柔和边界可以同时存在。" },
  ];
  const durations = distributeDuration(input.duration, beats.length);
  const materialDirection = input.materialPreference === "GLOBAL"
    ? "国际通用成年人物与现代生活场景"
    : input.materialPreference === "SCENERY"
      ? "以中国城市环境、室内空间、物品特写为主，尽量不出现清晰正脸"
      : "中国成年人物，中国面孔，中国职场、家庭或城市环境";
  const scenes: Scene[] = beats.map(([label, narration], index) => ({
    id: `scene-${index + 1}`,
    order: index + 1,
    duration: durations[index],
    narration,
    subtitle: narration,
    composition: `${label}：主体位于画面中下部，顶部留出字幕安全区`,
    motion: index % 2 === 0 ? "镜头缓慢推进，轻微环境运动" : "固定中景转近景，人物微表情变化",
    prompt: `${stylePrompt[input.visualStyle]}。素材方向：${materialDirection}。主题：${subject}。场景 ${index + 1}：${narration}。${input.tone ?? "克制温暖"}，9:16，无文字无水印。`,
    negativePrompt: "低清晰度，畸形手指，文字，水印，品牌标志，过度磨皮，名人脸，未成年人",
  }));
  const script = scenes.map((scene) => scene.narration).join("");
  return {
    angles,
    selectedAngleId: angles[0].id,
    title: angles[0].title,
    hook: angles[0].hook,
    script,
    scenes,
    platformCopies: buildPlatformCopies(angles[0].title, script),
  };
}

function timestamp(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.round((seconds - Math.floor(seconds)) * 1000);
  return [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join(":") + `,${String(millis).padStart(3, "0")}`;
}

export function buildSrt(scenes: Pick<Scene, "order" | "duration" | "subtitle">[]) {
  let cursor = 0;
  return scenes
    .sort((a, b) => a.order - b.order)
    .map((scene, index) => {
      const start = cursor;
      cursor += scene.duration;
      return `${index + 1}\n${timestamp(start)} --> ${timestamp(cursor)}\n${scene.subtitle}\n`;
    })
    .join("\n");
}

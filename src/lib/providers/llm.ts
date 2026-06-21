import { buildDemoPlan } from "@/lib/content";
import type { ContentPlan, ProjectInput } from "@/lib/types";

export interface LLMProvider {
  id: string;
  name: string;
  enabled: boolean;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  generatePlan(input: ProjectInput): Promise<ContentPlan>;
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  return JSON.parse(fenced ?? text);
}

export class DeepSeekProvider implements LLMProvider {
  id = "deepseek";
  name = "DeepSeek";
  enabled = Boolean(process.env.DEEPSEEK_API_KEY);

  async testConnection() {
    if (!this.enabled) return { ok: false, message: "未配置 DEEPSEEK_API_KEY" };
    const response = await fetch(`${process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com"}/models`, {
      headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: response.ok, message: response.ok ? "连接成功" : `连接失败 (${response.status})` };
  }

  async generatePlan(input: ProjectInput) {
    if (!this.enabled) return buildDemoPlan(input);
    const prompt = `你是中文短视频策划。根据输入生成约 ${input.duration} 秒的情绪共鸣口播视频。
输入：${input.input}
受众：${input.audience}
语气：${input.tone}
避免：${input.avoid}
视觉风格：${input.visualStyle}
素材偏好：${input.materialPreference === "GLOBAL" ? "国际通用人物与场景" : input.materialPreference === "SCENERY" ? "尽量使用无人景物、物品和环境镜头" : "中国风，优先中国成年人物、中国城市、中国家庭和中国职场场景"}
只返回 JSON，字段严格为 angles[{id,title,hook,coreMessage}], selectedAngleId, title, hook, script, scenes[{id,order,duration,narration,subtitle,composition,motion,prompt,negativePrompt}], platformCopies[{platform,title,body,tags}]。
口播总字数必须至少 ${Math.round(input.duration * 4)} 个中文字符，确保自然语速能够覆盖约 ${input.duration} 秒。
总时长必须等于 ${input.duration}，分镜 6-10 个，平台只能是 DOUYIN、XIAOHONGSHU、WECHAT_CHANNELS。不得仿冒真人或使用名人肖像。`;

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(`${process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com"}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
            temperature: Number(process.env.DEEPSEEK_TEMPERATURE ?? 0.8),
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: "输出真实、克制、有共鸣的中文短视频方案，拒绝侵权、仿冒和虚假承诺。" },
              { role: "user", content: prompt },
            ],
          }),
          signal: AbortSignal.timeout(45_000),
        });
        if (!response.ok) throw new Error(`DeepSeek 请求失败 (${response.status})`);
        const data = await response.json();
        return extractJson(data.choices[0].message.content) as ContentPlan;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
    throw lastError;
  }
}

export class DisabledProvider implements LLMProvider {
  enabled = false;
  constructor(public id: string, public name: string) {}
  async testConnection() {
    return { ok: false, message: `需要单独配置 ${this.name} API Key，网页订阅不可用于后端调用` };
  }
  async generatePlan(input: ProjectInput): Promise<ContentPlan> {
    void input;
    throw new Error(`${this.name} Provider 未启用`);
  }
}

export function getProviders(): LLMProvider[] {
  return [
    new DeepSeekProvider(),
    new DisabledProvider("openai", "OpenAI"),
    new DisabledProvider("anthropic", "Anthropic"),
  ];
}

export function getProvider(id = "deepseek") {
  return getProviders().find((provider) => provider.id === id) ?? getProviders()[0];
}

export async function expandNarration(scenes: { narration: string }[], duration: number) {
  if (!process.env.DEEPSEEK_API_KEY) return null;
  const minimumLength = Math.round(duration * 4);
  if (scenes.map((scene) => scene.narration).join("").length >= minimumLength) return null;
  const prompt = `将下面口播扩写为适合 ${duration} 秒自然朗读的中文短视频文案。
必须返回严格 JSON：{"scenes":["..."]}，数组正好 ${scenes.length} 项。
每一项对应原来的同序镜头，保留主题和逻辑，每段约 ${Math.ceil(minimumLength / scenes.length)} 到 ${Math.ceil(minimumLength / scenes.length) + 12} 个中文字符。
总字数至少 ${minimumLength} 个中文字符。自然口语、克制、有停顿感，不重复、不说教。
原文：${JSON.stringify(scenes.map((scene) => scene.narration))}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com"}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "你是短视频口播编辑，严格满足分段数量和最低字数，只输出合法 JSON。" },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) continue;
    const data = await response.json();
    const parsed = extractJson(data.choices[0].message.content) as { scenes?: unknown[] };
    const result = parsed.scenes?.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    if (result?.length === scenes.length && result.join("").length >= minimumLength * 0.95) return result;
  }
  const continuations = [
    "你总先理解别人，却很少停下来问自己累不累。",
    "白天没消化的情绪，常常会在安静以后出现。",
    "别人看见你的可靠，却忘了你同样需要回应。",
    "成熟不是忍住，而是允许自己承认难过和疲惫。",
    "先从一次拒绝开始，把自己的感受放回前面。",
    "温柔可以有边界，真实的你同样值得被爱。",
    "当你诚实地面对自己，很多选择也会找到舒服的位置。",
    "不用马上做到完美，今天多照顾自己一点就已经很好。",
  ];
  const fallback = scenes.map((scene, index) => `${scene.narration}${continuations[index % continuations.length]}`);
  return fallback.join("").length >= minimumLength * 0.9 ? fallback : null;
}

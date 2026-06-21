import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepSeekProvider, DisabledProvider, getProvider, getProviders } from "@/lib/providers/llm";

describe("LLM providers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("exposes DeepSeek and disabled subscription-only providers", async () => {
    const providers = getProviders();
    expect(providers.map((provider) => provider.id)).toEqual(["deepseek", "openai", "anthropic"]);
    expect(await providers[1].testConnection()).toEqual({
      ok: false,
      message: "需要单独配置 OpenAI API Key，网页订阅不可用于后端调用",
    });
    await expect(new DisabledProvider("openai", "OpenAI").generatePlan({
      input: "test", duration: 60, visualStyle: "COMIC",
    })).rejects.toThrow("未启用");
  });

  it("uses demo generation when DeepSeek is not configured", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const provider = new DeepSeekProvider();
    const result = await provider.generatePlan({
      input: "成年人为什么不敢说累",
      duration: 60,
      visualStyle: "CARTOON",
    });
    expect(result.scenes).toHaveLength(8);
    expect(result.title).toBeTruthy();
    expect(await provider.testConnection()).toEqual({ ok: false, message: "未配置 DEEPSEEK_API_KEY" });
  });

  it("falls back to DeepSeek for an unknown provider id", () => {
    expect(getProvider("missing").id).toBe("deepseek");
  });
});

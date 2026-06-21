import { describe, expect, it } from "vitest";
import { buildDemoPlan, buildPlatformCopies, buildSrt } from "@/lib/content";

describe("content generation fallback", () => {
  it("creates a complete 90 second storyboard", () => {
    const result = buildDemoPlan({
      input: "成年人的崩溃往往悄无声息",
      audience: "25-35岁职场人",
      tone: "克制、温暖",
      visualStyle: "COMIC",
      duration: 90,
    });
    expect(result.angles).toHaveLength(3);
    expect(result.scenes.length).toBeGreaterThanOrEqual(6);
    expect(result.scenes.reduce((sum, scene) => sum + scene.duration, 0)).toBe(90);
    expect(result.scenes.every((scene) => scene.prompt.includes("漫画"))).toBe(true);
  });

  it("builds platform-native copy and valid subtitles", () => {
    const copies = buildPlatformCopies("别再假装没事", "真正的坚强，是允许自己偶尔脆弱。");
    expect(copies.map((item) => item.platform)).toEqual(["DOUYIN", "XIAOHONGSHU", "WECHAT_CHANNELS"]);
    const srt = buildSrt([
      { order: 1, duration: 3, subtitle: "第一句" },
      { order: 2, duration: 2, subtitle: "第二句" },
    ]);
    expect(srt).toContain("00:00:00,000 --> 00:00:03,000");
    expect(srt).toContain("00:00:03,000 --> 00:00:05,000");
  });
});

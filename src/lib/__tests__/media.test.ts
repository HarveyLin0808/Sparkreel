import { describe, expect, it } from "vitest";
import { edgeSrtToAss } from "@/lib/subtitles";
import { buildPexelsQueries, buildPexelsQuery, choosePexelsVideoFile } from "@/lib/pexels";
import { nextRenderVersion, resolveRenderDuration, safeVideoFileName } from "@/lib/render";
import type { Project } from "@/lib/types";

describe("edgeSrtToAss", () => {
  it("keeps Edge timestamps and pins subtitles to the lower safe area", () => {
    const ass = edgeSrtToAss(
      "1\n00:00:00,100 --> 00:00:03,388\n第一句\n\n2\n00:00:03,775 --> 00:00:05,575\n第二句",
    );
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("Alignment=2");
    expect(ass).toContain("MarginV=150");
    expect(ass).toContain("Dialogue: 0,0:00:00.10,0:00:03.39,Default");
    expect(ass).toContain("第一句");
  });

  it("wraps long Chinese captions for the vertical safe area", () => {
    const ass = edgeSrtToAss(
      "1\n00:00:00,000 --> 00:00:05,000\n这是一段需要在竖屏视频底部自动换行显示的中文长字幕内容",
    );
    expect(ass).toContain("\\N");
  });
});

describe("Pexels helpers", () => {
  it("prefers portrait HD video close to 1080x1920", () => {
    const selected = choosePexelsVideoFile([
      { width: 1920, height: 1080, link: "landscape.mp4", quality: "hd" },
      { width: 720, height: 1280, link: "portrait-small.mp4", quality: "hd" },
      { width: 1080, height: 1920, link: "portrait.mp4", quality: "hd" },
    ]);
    expect(selected?.link).toBe("portrait.mp4");
  });

  it("builds a concise English stock-footage query", () => {
    expect(buildPexelsQuery("Asian woman, office setting, sitting at desk, slight forced smile, realistic")).toBe(
      "Asian woman office setting sitting desk",
    );
  });

  it("prioritizes precise Chinese people and city keywords by default", () => {
    const portrait = buildPexelsQueries("Asian woman emotional portrait in office", "CHINESE", 0);
    expect(portrait[0]).toBe("chinese woman office");
    expect(portrait).toContain("chinese woman portrait");
    expect(portrait).toContain("chinese portrait");

    const street = buildPexelsQueries("woman walking on a city street", "CHINESE", 1);
    expect(street[0]).toBe("shanghai street");
    expect(street).toContain("china street");
  });
});

describe("render duration", () => {
  it("keeps the target duration when narration fits", () => {
    expect(resolveRenderDuration(90, 84.2)).toBe(90);
  });

  it("extends the video beyond narration with a closing pause", () => {
    expect(resolveRenderDuration(90, 94.4)).toBe(98);
  });
});

describe("render versions", () => {
  it("creates numbered and filesystem-safe video names", () => {
    expect(safeVideoFileName('管理能力: "复盘"/成长?', 2)).toBe("管理能力 复盘成长-2.mp4");
  });

  it("migrates a legacy output before choosing the next version", () => {
    const project = {
      title: "懂事的代价",
      duration: 60,
      outputDuration: 65,
      outputUrl: "/api/media/renders/id/final.mp4",
      updatedAt: "2026-06-14T00:00:00.000Z",
    } as Project;
    expect(nextRenderVersion(project)).toBe(2);
    expect(project.renderOutputs).toEqual([
      expect.objectContaining({ version: 1, duration: 65, fileName: "懂事的代价-1.mp4" }),
    ]);
  });
});

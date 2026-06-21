import { describe, expect, it } from "vitest";
import { createProjectSchema, validateFileSignature, validateUpload } from "@/lib/schemas";

describe("createProjectSchema", () => {
  it("accepts a topic and applies defaults", () => {
    const result = createProjectSchema.parse({ input: "为什么越懂事的人越容易委屈自己" });
    expect(result.duration).toBe(90);
    expect(result.visualStyle).toBe("ASIAN_REALISTIC");
    expect(result.materialPreference).toBe("CHINESE");
  });

  it("rejects empty and overlong input", () => {
    expect(() => createProjectSchema.parse({ input: " " })).toThrow();
    expect(() => createProjectSchema.parse({ input: "a".repeat(12001) })).toThrow();
  });
});

describe("validateFileSignature", () => {
  it("recognizes real PNG and MP4 signatures", () => {
    expect(() => validateFileSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")).not.toThrow();
    expect(() => validateFileSignature(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), "video/mp4")).not.toThrow();
  });

  it("rejects a renamed executable", () => {
    expect(() => validateFileSignature(new Uint8Array([0x4d, 0x5a, 0x90, 0]), "image/png")).toThrow();
  });
});

describe("validateUpload", () => {
  it("accepts supported images and videos", () => {
    expect(validateUpload({ name: "scene.png", type: "image/png", size: 1024 }).kind).toBe("IMAGE");
    expect(validateUpload({ name: "scene.mp4", type: "video/mp4", size: 1024 }).kind).toBe("VIDEO");
  });

  it("rejects unsafe types and oversized files", () => {
    expect(() => validateUpload({ name: "x.svg", type: "image/svg+xml", size: 10 })).toThrow();
    expect(() => validateUpload({ name: "x.mp4", type: "video/mp4", size: 251 * 1024 * 1024 })).toThrow();
  });
});

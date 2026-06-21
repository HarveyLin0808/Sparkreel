import { describe, expect, it } from "vitest";
import { canTransition, nextProjectStatus } from "@/lib/workflow";

describe("project workflow", () => {
  it("allows the defined forward workflow", () => {
    expect(canTransition("DRAFT", "SCRIPT_CONFIRMED")).toBe(true);
    expect(nextProjectStatus("STORYBOARD_CONFIRMED")).toBe("WAITING_ASSETS");
    expect(nextProjectStatus("RENDERING")).toBe("REVIEW");
  });

  it("does not skip approval stages", () => {
    expect(canTransition("DRAFT", "READY_TO_RENDER")).toBe(false);
    expect(canTransition("EXPORTED", "DRAFT")).toBe(false);
  });
});

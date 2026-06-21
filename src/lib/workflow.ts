import type { ProjectStatus } from "@/lib/types";

const transitions: Record<ProjectStatus, ProjectStatus[]> = {
  DRAFT: ["SCRIPT_CONFIRMED"],
  SCRIPT_CONFIRMED: ["DRAFT", "STORYBOARD_CONFIRMED"],
  STORYBOARD_CONFIRMED: ["SCRIPT_CONFIRMED", "WAITING_ASSETS"],
  WAITING_ASSETS: ["STORYBOARD_CONFIRMED", "READY_TO_RENDER"],
  READY_TO_RENDER: ["WAITING_ASSETS", "RENDERING"],
  RENDERING: ["READY_TO_RENDER", "REVIEW"],
  REVIEW: ["READY_TO_RENDER", "EXPORTED"],
  EXPORTED: ["REVIEW"],
};

export function canTransition(from: ProjectStatus, to: ProjectStatus) {
  return transitions[from].includes(to);
}

export function nextProjectStatus(status: ProjectStatus): ProjectStatus | null {
  const forward: Partial<Record<ProjectStatus, ProjectStatus>> = {
    DRAFT: "SCRIPT_CONFIRMED",
    SCRIPT_CONFIRMED: "STORYBOARD_CONFIRMED",
    STORYBOARD_CONFIRMED: "WAITING_ASSETS",
    WAITING_ASSETS: "READY_TO_RENDER",
    READY_TO_RENDER: "RENDERING",
    RENDERING: "REVIEW",
    REVIEW: "EXPORTED",
  };
  return forward[status] ?? null;
}

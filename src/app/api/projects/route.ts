import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createProjectSchema } from "@/lib/schemas";
import { getProvider } from "@/lib/providers/llm";
import { projectStore } from "@/lib/store";
import type { Project } from "@/lib/types";

export async function GET() {
  return NextResponse.json({ ok: true, projects: await projectStore.list() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = createProjectSchema.parse(body);
    const plan = await getProvider(body.provider).generatePlan(input);
    const now = new Date().toISOString();
    const project: Project = {
      id: crypto.randomUUID(),
      ...input,
      ...plan,
      status: "DRAFT",
      createdAt: now,
      updatedAt: now,
      renderProgress: 0,
    };
    await projectStore.save(project);
    return NextResponse.json({ ok: true, project }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

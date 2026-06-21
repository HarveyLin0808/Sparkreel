import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { projectStore } from "@/lib/store";
import { canTransition } from "@/lib/workflow";
import { PROJECT_STATUSES, type ProjectStatus, type VisualStyle } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  const { id } = await context.params;
  const project = await projectStore.get(id);
  if (!project) return NextResponse.json({ ok: false, error: "项目不存在" }, { status: 404 });
  return NextResponse.json({ ok: true, project });
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const project = await projectStore.get(id);
    if (!project) return NextResponse.json({ ok: false, error: "项目不存在" }, { status: 404 });
    const body = await request.json();
    if (body.status) {
      if (!PROJECT_STATUSES.includes(body.status as ProjectStatus) || !canTransition(project.status, body.status)) {
        return NextResponse.json({ ok: false, error: `不能从 ${project.status} 切换到 ${body.status}` }, { status: 409 });
      }
      project.status = body.status;
    }
    if (typeof body.title === "string" && body.title.trim()) project.title = body.title.trim().slice(0, 120);
    if (typeof body.script === "string" && body.script.trim()) project.script = body.script.trim().slice(0, 12000);
    if (["CARTOON", "COMIC", "ASIAN_REALISTIC"].includes(body.visualStyle)) project.visualStyle = body.visualStyle as VisualStyle;
    if (typeof body.voiceName === "string" && /^zh-CN-[\w-]+Neural(?:-V2)?$/.test(body.voiceName)) {
      project.voiceName = body.voiceName;
    }
    if (typeof body.voiceRate === "string" && /^[+-]\d+%$/.test(body.voiceRate)) project.voiceRate = body.voiceRate;
    if (["CHINESE", "GLOBAL", "SCENERY"].includes(body.materialPreference)) {
      project.materialPreference = body.materialPreference;
    }
    if (
      typeof body.script === "string"
      || typeof body.voiceName === "string"
      || typeof body.voiceRate === "string"
      || typeof body.materialPreference === "string"
    ) {
      if (project.status === "REVIEW" || project.status === "EXPORTED") project.status = "READY_TO_RENDER";
      project.outputUrl = undefined;
      project.outputDuration = undefined;
      project.renderProgress = 0;
    }
    project.updatedAt = new Date().toISOString();
    return NextResponse.json({ ok: true, project: await projectStore.save(project) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, context: Context) {
  const { id } = await context.params;
  if (!(await projectStore.delete(id))) return NextResponse.json({ ok: false, error: "项目不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

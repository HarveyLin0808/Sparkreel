import { NextResponse } from "next/server";
import { buildSrt } from "@/lib/content";
import { projectStore } from "@/lib/store";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  const { id } = await context.params;
  const project = await projectStore.get(id);
  if (!project) return NextResponse.json({ ok: false, error: "项目不存在" }, { status: 404 });
  return NextResponse.json({
    ok: true,
    package: {
      projectId: project.id,
      title: project.title,
      video: project.outputUrl,
      videos: project.renderOutputs ?? [],
      subtitles: buildSrt(project.scenes),
      coverPrompt: project.scenes[0]?.prompt,
      platformCopies: project.platformCopies,
      manifest: {
        resolution: "1080x1920",
        duration: project.outputDuration ?? project.duration,
        scenes: project.scenes.length,
        exportedAt: new Date().toISOString(),
      },
    },
  });
}

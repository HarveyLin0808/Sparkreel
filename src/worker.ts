import { Worker } from "bullmq";
import { projectStore } from "@/lib/store";
import { ensureRenderHistory, nextRenderVersion, renderProject } from "@/lib/render";
import { redisConnection } from "@/lib/queue";

if (!process.env.REDIS_URL) throw new Error("REDIS_URL 未配置");

const worker = new Worker(
  "sparkreel-render",
  async (job) => {
    const project = await projectStore.get(job.data.projectId);
    if (!project) throw new Error("项目不存在");
    try {
      ensureRenderHistory(project);
      const output = await renderProject(project, async (progress, stage) => {
        project.renderProgress = progress;
        if (stage) project.renderStage = stage;
        project.updatedAt = new Date().toISOString();
        await projectStore.save(project);
        await job.updateProgress(progress);
      }, nextRenderVersion(project));
      project.renderOutputs = [...(project.renderOutputs ?? []), output];
      project.outputUrl = output.url;
      project.outputDuration = output.duration;
      project.status = "REVIEW";
      project.renderProgress = 100;
      project.renderStage = "DONE";
      await projectStore.save(project);
      return { outputUrl: output.url };
    } catch (error) {
      project.status = "READY_TO_RENDER";
      project.renderStage = undefined;
      project.renderError = error instanceof Error ? error.message : "渲染失败";
      await projectStore.save(project);
      throw error;
    }
  },
  { connection: redisConnection(), concurrency: Number(process.env.RENDER_CONCURRENCY ?? 1) },
);

worker.on("completed", (job) => console.log(JSON.stringify({ level: "info", event: "render.completed", jobId: job.id })));
worker.on("failed", (job, error) => console.error(JSON.stringify({ level: "error", event: "render.failed", jobId: job?.id, error: error.message })));

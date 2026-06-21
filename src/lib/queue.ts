import { Queue } from "bullmq";

let queue: Queue | null = null;

export function redisConnection() {
  const url = new URL(process.env.REDIS_URL!);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null,
  };
}

export function getRenderQueue() {
  if (!process.env.REDIS_URL) return null;
  if (!queue) {
    queue = new Queue("sparkreel-render", { connection: redisConnection() });
  }
  return queue;
}

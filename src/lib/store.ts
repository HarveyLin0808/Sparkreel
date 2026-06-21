import type { Project } from "@/lib/types";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const globalStore = globalThis as typeof globalThis & {
  sparkreelProjects?: Map<string, Project>;
  sparkreelPrisma?: import("@prisma/client").PrismaClient;
};
const projects = globalStore.sparkreelProjects ?? new Map<string, Project>();
globalStore.sparkreelProjects = projects;
const localStorePath = path.join(process.cwd(), "storage", "projects.json");
let localStoreLoaded = false;

async function persistLocalStore() {
  await mkdir(path.dirname(localStorePath), { recursive: true });
  await writeFile(localStorePath, JSON.stringify([...projects.values()], null, 2), "utf8");
}

async function ensureLocalStoreLoaded() {
  if (localStoreLoaded) return;
  localStoreLoaded = true;
  try {
    const records = JSON.parse(await readFile(localStorePath, "utf8")) as Project[];
    for (const project of records) projects.set(project.id, project);
  } catch {
    if (projects.size > 0) await persistLocalStore();
  }
}

async function prisma() {
  if (!process.env.DATABASE_URL) return null;
  if (!globalStore.sparkreelPrisma) {
    const { PrismaClient } = await import("@prisma/client");
    globalStore.sparkreelPrisma = new PrismaClient();
  }
  return globalStore.sparkreelPrisma;
}

export const projectStore = {
  async list() {
    const db = await prisma();
    if (db) {
      const records = await db.project.findMany({ orderBy: { updatedAt: "desc" } });
      return records.map((record) => record.snapshot as unknown as Project);
    }
    await ensureLocalStoreLoaded();
    return [...projects.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async get(id: string) {
    const db = await prisma();
    if (db) {
      const record = await db.project.findUnique({ where: { id } });
      return record ? record.snapshot as unknown as Project : null;
    }
    await ensureLocalStoreLoaded();
    return projects.get(id) ?? null;
  },
  async save(project: Project) {
    const db = await prisma();
    if (db) {
      await db.project.upsert({
        where: { id: project.id },
        create: { id: project.id, title: project.title, status: project.status, snapshot: project as never },
        update: { title: project.title, status: project.status, snapshot: project as never },
      });
      return project;
    }
    await ensureLocalStoreLoaded();
    projects.set(project.id, project);
    await persistLocalStore();
    return project;
  },
  async delete(id: string) {
    const db = await prisma();
    if (db) {
      const result = await db.project.deleteMany({ where: { id } });
      return result.count > 0;
    }
    await ensureLocalStoreLoaded();
    const deleted = projects.delete(id);
    if (deleted) await persistLocalStore();
    return deleted;
  },
  async storageBytes() {
    const all = await this.list();
    return Buffer.byteLength(JSON.stringify(all));
  },
};

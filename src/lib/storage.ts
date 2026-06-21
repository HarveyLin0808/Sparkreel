import { mkdir, writeFile, readFile, stat, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export interface StorageProvider {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<string>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

class LocalStorageProvider implements StorageProvider {
  private root = path.join(process.cwd(), "storage");

  async put(key: string, bytes: Uint8Array) {
    const target = path.join(this.root, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    return `/api/media/${key.split(path.sep).join("/")}`;
  }

  async delete(key: string) {
    await rm(path.join(this.root, key), { force: true });
  }

  async get(key: string) {
    return new Uint8Array(await readFile(path.join(this.root, key)));
  }
}

class S3StorageProvider implements StorageProvider {
  private client = new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: process.env.S3_ACCESS_KEY_ID
      ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" }
      : undefined,
  });
  private bucket = process.env.S3_BUCKET!;

  async put(key: string, bytes: Uint8Array, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: contentType }));
    return `/api/assets/${key}`;
  }

  async get(key: string) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new Error("对象存储返回空文件");
    return new Uint8Array(await result.Body.transformToByteArray());
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export function getStorage(): StorageProvider {
  return process.env.S3_BUCKET ? new S3StorageProvider() : new LocalStorageProvider();
}

export async function getLocalStorageUsage(root = path.join(process.cwd(), "storage")): Promise<number> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const sizes = await Promise.all(
      entries.map(async (entry) => {
        const target = path.join(root, entry.name);
        return entry.isDirectory() ? getLocalStorageUsage(target) : (await stat(target)).size;
      }),
    );
    return sizes.reduce((sum, size) => sum + size, 0);
  } catch {
    return 0;
  }
}

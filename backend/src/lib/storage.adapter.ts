import fs from "fs";
import path from "path";
import crypto from "crypto";
import { env } from "../config/env";

export type StoredFile = {
  /** Opaque reference used to read/delete the file later. Never expose this directly to clients - it is an internal detail of whichever adapter is active. */
  ref: string;
  sizeBytes: number;
};

export interface StorageAdapter {
  save(buffer: Buffer, originalName: string): Promise<StoredFile>;
  read(ref: string): Promise<Buffer>;
  delete(ref: string): Promise<void>;
}

/**
 * Local-disk storage adapter - the default for the low-cost, single-instance
 * deployment described in 02-Architecture.md (Attachments, Import error
 * handling, and Export files all go through this). Swap `STORAGE_PROVIDER`
 * to a real adapter (S3, Azure Blob) in production; nothing outside this
 * file needs to change since every caller only depends on the
 * `StorageAdapter` interface. See deployment/06-Deployment-AWS.md and
 * deployment/07-Deployment-Azure.md ("Object Storage") for the managed
 * services this stands in for, and the note there that local disk storage
 * does NOT survive a redeploy/restart of an ephemeral container - it is only
 * appropriate for the single-persistent-instance topology those guides
 * describe, or for local development.
 */
class LocalDiskStorageAdapter implements StorageAdapter {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  async save(buffer: Buffer, originalName: string): Promise<StoredFile> {
    // Extension kept only for cosmetic/debugging value (e.g. so files on disk
    // are recognizable) - the "" -> a-zA-Z0-9. allowlist below neutralizes
    // anything a malicious original filename might otherwise smuggle in
    // (e.g. "../../evil", null bytes, path separators).
    const safeExt = path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, "").slice(0, 10);
    const ref = `${crypto.randomUUID()}${safeExt}`;
    const fullPath = path.join(this.baseDir, ref);
    await fs.promises.writeFile(fullPath, buffer);
    return { ref, sizeBytes: buffer.length };
  }

  async read(ref: string): Promise<Buffer> {
    return fs.promises.readFile(this.resolveSafe(ref));
  }

  async delete(ref: string): Promise<void> {
    await fs.promises.rm(this.resolveSafe(ref), { force: true });
  }

  /**
   * Defends against path traversal. `ref` is meant to be an opaque token we
   * generated ourselves (in `save`), but every caller ultimately reads it
   * back out of the database, so treat it as untrusted input rather than
   * assuming it can never contain something like "../../../etc/passwd".
   */
  private resolveSafe(ref: string): string {
    if (!ref || !ref.trim()) {
      // path.resolve(baseDir, "") === baseDir, which would otherwise pass the
      // traversal check below and let a blank ref resolve to (and attempt to
      // read/delete) the storage directory itself (flagged in code review).
      throw new Error("Invalid file reference.");
    }
    const fullPath = path.resolve(this.baseDir, ref);
    if (fullPath !== this.baseDir && !fullPath.startsWith(this.baseDir + path.sep)) {
      throw new Error("Invalid file reference.");
    }
    return fullPath;
  }
}

function buildStorageAdapter(): StorageAdapter {
  switch (env.storageProvider) {
    case "local":
    default:
      return new LocalDiskStorageAdapter(env.storageLocalDir);
  }
}

export const storage: StorageAdapter = buildStorageAdapter();

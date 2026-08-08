import { mkdirSync } from "node:fs";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import type { ContextBundle, ContextFileInfo, ContextSnapshot, ContextStatus } from "@sidebar/shared";

const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;
const PREVIEW_BYTES = 3200;
const TEXT_EXT = /\.(txt|md|mdx|json|jsonl|csv|tsv|yaml|yml|toml|xml|html|css|js|jsx|ts|tsx|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|sql|sh|ps1|env|gitignore)$/i;

interface ContextRecord extends ContextBundle {
  stagingRoot: string;
  workspaceRoot?: string;
  previews: Array<{ path: string; text: string }>;
}

export class ContextStore {
  readonly meetingId = `m-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 6)}`;
  readonly root = join(tmpdir(), "sidebar-meetings", this.meetingId);
  readonly workspaceRoot = join(this.root, "workspace");

  private readonly inboxRoot = join(this.root, "inbox");
  private readonly contextRoot = join(this.workspaceRoot, "context");
  private records = new Map<string, ContextRecord>();

  constructor() {
    mkdirSync(this.inboxRoot, { recursive: true });
    mkdirSync(this.contextRoot, { recursive: true });
  }

  snapshot(): ContextSnapshot {
    return {
      meetingId: this.meetingId,
      workspaceRoot: this.workspaceRoot,
      items: this.items(),
    };
  }

  items(): ContextBundle[] {
    return Array.from(this.records.values()).map(publicBundle);
  }

  async upload(form: FormData): Promise<ContextBundle> {
    const files = form.getAll("files").filter((v): v is File => v instanceof File);
    if (files.length === 0) throw new ContextUploadError("No files attached", 400);

    const paths = form.getAll("paths").map((v) => String(v));
    const uploadedBy = cleanToken(String(form.get("uploaderId") ?? "")) || "anonymous";
    const uploadedByName = cleanName(String(form.get("uploaderName") ?? "")) || "Participant";
    const role = String(form.get("role") ?? "viewer") === "host" ? "host" : "viewer";
    const status: ContextStatus = role === "host" ? "accepted" : "pending";
    const id = crypto.randomUUID().slice(0, 12);
    const title = cleanName(String(form.get("title") ?? "")) || defaultTitle(files, paths);
    const uploadDir = `${cleanPathSegment(uploadedByName)}-${id}`;
    const root = status === "accepted" ? join(this.contextRoot, uploadDir) : join(this.inboxRoot, id);

    await mkdir(root, { recursive: true });
    let totalBytes = 0;
    const infos: ContextFileInfo[] = [];
    const previews: ContextRecord["previews"] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      totalBytes += file.size;
      if (totalBytes > MAX_UPLOAD_BYTES) {
        await rm(root, { recursive: true, force: true });
        throw new ContextUploadError("Context upload is too large", 413);
      }
      const safeRel = safeRelativePath(paths[i] || file.name || `file-${i + 1}`);
      const target = join(root, safeRel);
      await mkdir(dirname(target), { recursive: true });
      const bytes = new Uint8Array(await file.arrayBuffer());
      await writeFile(target, bytes);
      infos.push({ name: basename(safeRel), relativePath: safeRel, size: file.size, type: file.type || undefined });
      const preview = previewText(file, bytes);
      if (preview) previews.push({ path: safeRel, text: preview });
    }

    const record: ContextRecord = {
      id,
      title,
      uploadedBy,
      uploadedByName,
      uploadedAt: Date.now(),
      status,
      fileCount: files.length,
      totalBytes,
      files: infos,
      stagingRoot: root,
      workspaceRoot: status === "accepted" ? root : undefined,
      workspacePath: status === "accepted" ? relative(this.workspaceRoot, root) : undefined,
      acceptedAt: status === "accepted" ? Date.now() : undefined,
      previews,
    };
    this.records.set(id, record);
    return publicBundle(record);
  }

  async accept(id: string): Promise<ContextBundle | null> {
    const record = this.records.get(id);
    if (!record || record.status !== "pending") return record ? publicBundle(record) : null;
    const dest = join(this.contextRoot, `${cleanPathSegment(record.uploadedByName)}-${record.id}`);
    await rm(dest, { recursive: true, force: true });
    await mkdir(dirname(dest), { recursive: true });
    await cp(record.stagingRoot, dest, { recursive: true });
    record.status = "accepted";
    record.acceptedAt = Date.now();
    record.workspaceRoot = dest;
    record.workspacePath = relative(this.workspaceRoot, dest);
    return publicBundle(record);
  }

  async reject(id: string): Promise<ContextBundle | null> {
    const record = this.records.get(id);
    if (!record || record.status !== "pending") return record ? publicBundle(record) : null;
    record.status = "rejected";
    record.rejectedAt = Date.now();
    await rm(record.stagingRoot, { recursive: true, force: true });
    return publicBundle(record);
  }

  async clear(): Promise<ContextSnapshot> {
    this.records.clear();
    await rm(this.inboxRoot, { recursive: true, force: true });
    await rm(this.contextRoot, { recursive: true, force: true });
    await mkdir(this.inboxRoot, { recursive: true });
    await mkdir(this.contextRoot, { recursive: true });
    return this.snapshot();
  }

  summary(): string {
    const accepted = Array.from(this.records.values()).filter((r) => r.status === "accepted");
    if (accepted.length === 0) return "";
    const lines = [
      "Accepted meeting context:",
      `Workspace root: ${this.workspaceRoot}`,
      ...accepted.flatMap((item) => [
        `- ${item.title} from ${item.uploadedByName} (${item.fileCount} file${item.fileCount === 1 ? "" : "s"}, ${formatBytes(item.totalBytes)}) at ${item.workspacePath}`,
        ...item.files.slice(0, 10).map((f) => `  - ${f.relativePath} (${formatBytes(f.size)})`),
      ]),
    ];
    const previews = accepted.flatMap((item) => item.previews.slice(0, 3).map((p) => `\n--- ${item.title}/${p.path} ---\n${p.text}`)).slice(0, 8);
    return [...lines, ...previews].join("\n").slice(0, 12000);
  }
}

export class ContextUploadError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function publicBundle(record: ContextRecord): ContextBundle {
  const { stagingRoot: _stagingRoot, workspaceRoot: _workspaceRoot, previews: _previews, ...bundle } = record;
  return { ...bundle, files: record.files.map((f) => ({ ...f })) };
}

function defaultTitle(files: File[], paths: string[]): string {
  if (files.length === 1) return paths[0] || files[0]?.name || "Context file";
  return `${files.length} files`;
}

function previewText(file: File, bytes: Uint8Array): string | null {
  const name = file.name || "";
  const textLike = file.type.startsWith("text/") || file.type === "application/json" || TEXT_EXT.test(name);
  if (!textLike) return null;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, PREVIEW_BYTES));
  return text.replace(/\0/g, "").trim().slice(0, PREVIEW_BYTES);
}

function safeRelativePath(input: string): string {
  const clean = input.replace(/\\/g, "/");
  const parts = clean
    .split("/")
    .map((p) => cleanPathSegment(p))
    .filter(Boolean)
    .filter((p) => p !== "." && p !== "..");
  return parts.length ? parts.join("/") : "context-file";
}

function cleanPathSegment(input: string): string {
  return input
    .trim()
    .replace(/[<>:"|?*\x00-\x1f]/g, "_")
    .replace(/^\.+$/, "_")
    .slice(0, 96);
}

function cleanName(input: string): string {
  return input.trim().replace(/\s+/g, " ").slice(0, 80);
}

function cleanToken(input: string): string {
  return input.trim().replace(/[^a-z0-9_-]/gi, "").slice(0, 80);
}

function basename(path: string): string {
  return path.split("/").pop() || path;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

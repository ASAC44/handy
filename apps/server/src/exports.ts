import { existsSync, mkdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { toDesignMd, type ExportFileInfo, type ExportFileKind, type ExportSnapshot, type MeetingSummary, type ThemeKey, type ThemeTokens } from "@sidebar/shared";
import { config } from "./config";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

interface SavedArtifact {
  id: string;
  buildId: string;
  intent: string;
  themeKey: ThemeKey;
  relativePath: string;
}

export class ExportStore {
  private meetingId = "";
  private root = "";
  private startedAt = Date.now();
  private updatedAt = Date.now();
  private files = new Map<string, ExportFileInfo>();
  private artifacts = new Map<string, SavedArtifact>();
  private transcript: Array<{ speaker?: string; text: string; ts: number }> = [];

  constructor(private readonly baseRoot = resolve(config.exportsDir)) {
    mkdirSync(this.baseRoot, { recursive: true });
    this.beginMeeting("Sidebar Meeting");
  }

  beginMeeting(title: string): ExportSnapshot {
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    this.meetingId = `m-${stamp}-${crypto.randomUUID().slice(0, 6)}`;
    this.root = join(this.baseRoot, this.meetingId);
    this.startedAt = Date.now();
    this.updatedAt = this.startedAt;
    this.files.clear();
    this.artifacts.clear();
    this.transcript = [];
    mkdirSync(this.root, { recursive: true });
    this.writeTextSync("README.md", "readme", meetingReadme(title, this.meetingId), "text/markdown; charset=utf-8", "README.md");
    return this.snapshot();
  }

  snapshot(): ExportSnapshot {
    return {
      meetingId: this.meetingId,
      root: this.root,
      startedAt: this.startedAt,
      updatedAt: this.updatedAt,
      files: Array.from(this.files.values()).sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    };
  }

  async saveTranscriptLine(line: { speaker?: string; text: string; ts: number }): Promise<ExportSnapshot> {
    this.transcript.push(line);
    const body = this.transcript
      .map((item) => {
        const at = new Date(item.ts).toISOString();
        const who = item.speaker?.trim() || "Speaker";
        return `- ${at} **${who}:** ${item.text}`;
      })
      .join("\n");
    await this.writeText("transcript.md", "transcript", `# Transcript\n\n${body}\n`, "text/markdown; charset=utf-8", "Transcript");
    return this.snapshot();
  }

  async saveSummary(summary: MeetingSummary): Promise<ExportSnapshot> {
    await this.writeText("summary.json", "summary", JSON.stringify(summary, null, 2) + "\n", "application/json; charset=utf-8", "Summary JSON");
    return this.snapshot();
  }

  async saveDesign(theme: ThemeTokens): Promise<ExportSnapshot> {
    await this.writeText("DESIGN.md", "design", toDesignMd(theme), "text/markdown; charset=utf-8", "DESIGN.md");
    return this.snapshot();
  }

  async savePrototype(input: { id: string; buildId: string; intent: string; themeKey: ThemeKey; html: string }): Promise<ExportSnapshot> {
    const prior = this.artifacts.get(input.id);
    const relativePath = prior?.relativePath ?? join("prototypes", `${safeSegment(input.intent).slice(0, 48) || "prototype"}-${input.id}.html`);
    this.artifacts.set(input.id, {
      id: input.id,
      buildId: input.buildId,
      intent: input.intent,
      themeKey: input.themeKey,
      relativePath,
    });
    await this.writeText(relativePath, "prototype", input.html, "text/html; charset=utf-8", `${input.intent || "Prototype"}.html`);
    return this.snapshot();
  }

  async refinePrototype(id: string, html: string): Promise<ExportSnapshot | null> {
    const artifact = this.artifacts.get(id);
    if (!artifact) return null;
    await this.writeText(artifact.relativePath, "prototype", html, "text/html; charset=utf-8", `${artifact.intent || "Prototype"}.html`);
    return this.snapshot();
  }

  async saveRecap(html: string): Promise<ExportSnapshot> {
    await this.writeText("meeting-recap.html", "recap", html, "text/html; charset=utf-8", "meeting-recap.html");
    return this.snapshot();
  }

  serve(pathname: string): Response {
    const prefix = `/exports/${this.meetingId}/`;
    if (!pathname.startsWith(prefix)) return new Response("Not Found", { status: 404 });
    let rel: string;
    try {
      rel = decodeURIComponent(pathname.slice(prefix.length)).replace(/\\/g, "/");
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    const info = this.files.get(rel);
    if (!info) return new Response("Not Found", { status: 404 });
    const target = resolve(this.root, rel);
    if (!isInside(this.root, target) || !existsSync(target) || !statSync(target).isFile()) {
      return new Response("Not Found", { status: 404 });
    }
    const realRoot = realpathSync(this.root);
    if (!isInside(realRoot, realpathSync(target))) return new Response("Forbidden", { status: 403 });
    return new Response(Bun.file(target), {
      headers: {
        "content-type": info.mime,
        "content-disposition": `attachment; filename="${basename(info.name).replace(/"/g, "")}"`,
      },
    });
  }

  private async writeText(relativePath: string, kind: ExportFileKind, body: string, mime: string, name: string): Promise<void> {
    const rel = normalizeRelativePath(relativePath);
    const target = resolve(this.root, rel);
    if (!isInside(this.root, target)) throw new Error(`export path escaped root: ${relativePath}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body, "utf8");
    const updatedAt = Date.now();
    this.updatedAt = updatedAt;
    this.files.set(rel, {
      id: rel,
      kind,
      name,
      relativePath: rel,
      size: Buffer.byteLength(body),
      mime,
      updatedAt,
      url: this.publicUrl(rel),
    });
    if (kind !== "manifest") await this.writeManifest();
  }

  private writeTextSync(relativePath: string, kind: ExportFileKind, body: string, mime: string, name: string): void {
    const rel = normalizeRelativePath(relativePath);
    const target = resolve(this.root, rel);
    if (!isInside(this.root, target)) throw new Error(`export path escaped root: ${relativePath}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body, "utf8");
    const updatedAt = Date.now();
    this.updatedAt = updatedAt;
    this.files.set(rel, {
      id: rel,
      kind,
      name,
      relativePath: rel,
      size: Buffer.byteLength(body),
      mime,
      updatedAt,
      url: this.publicUrl(rel),
    });
    if (kind !== "manifest") this.writeManifestSync();
  }

  private async writeManifest(): Promise<void> {
    const rel = "manifest.json";
    const updatedAt = Date.now();
    const manifestEntry: ExportFileInfo = {
      id: rel,
      kind: "manifest",
      name: "manifest.json",
      relativePath: rel,
      size: 0,
      mime: MIME[".json"]!,
      updatedAt,
      url: this.publicUrl(rel),
    };
    const files = [...Array.from(this.files.values()).filter((f) => f.kind !== "manifest"), manifestEntry].sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath),
    );
    const manifest = JSON.stringify({ ...this.snapshot(), updatedAt, files }, null, 2) + "\n";
    manifestEntry.size = Buffer.byteLength(manifest);
    const target = resolve(this.root, rel);
    await writeFile(target, manifest, "utf8");
    this.files.set(rel, manifestEntry);
    this.updatedAt = updatedAt;
  }

  private writeManifestSync(): void {
    const rel = "manifest.json";
    const updatedAt = Date.now();
    const manifestEntry: ExportFileInfo = {
      id: rel,
      kind: "manifest",
      name: "manifest.json",
      relativePath: rel,
      size: 0,
      mime: MIME[".json"]!,
      updatedAt,
      url: this.publicUrl(rel),
    };
    const files = [...Array.from(this.files.values()).filter((f) => f.kind !== "manifest"), manifestEntry].sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath),
    );
    const manifest = JSON.stringify({ ...this.snapshot(), updatedAt, files }, null, 2) + "\n";
    manifestEntry.size = Buffer.byteLength(manifest);
    writeFileSync(resolve(this.root, rel), manifest, "utf8");
    this.files.set(rel, manifestEntry);
    this.updatedAt = updatedAt;
  }

  private publicUrl(relativePath: string): string {
    return `/exports/${encodeURIComponent(this.meetingId)}/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
  }
}

function meetingReadme(title: string, meetingId: string): string {
  return [
    `# ${title || "Sidebar meeting"} exports`,
    "",
    `Meeting export id: \`${meetingId}\``,
    "",
    "This folder is written by Sidebar as the meeting runs. Participants can download these same files from the end-of-meeting recap screen.",
    "",
  ].join("\n");
}

function normalizeRelativePath(input: string): string {
  return input
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => safeSegment(part))
    .filter(Boolean)
    .join("/");
}

function safeSegment(input: string): string {
  const cleaned = input
    .trim()
    .replace(/[<>:"|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "-")
    .replace(/^\.+$/, "_")
    .slice(0, 96);
  return cleaned || "file";
}

function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + sep);
}

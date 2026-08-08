import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { ClientEvent, ContextBundle } from "@sidebar/shared";
import type { SidebarState } from "../ws";

interface UploadFile {
  file: File;
  path: string;
}

interface IgnoreRule {
  base: string;
  pattern: string;
  negated: boolean;
  dirOnly: boolean;
  anchored: boolean;
  hasSlash: boolean;
}

interface WebkitEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
}

interface WebkitFileEntry extends WebkitEntry {
  isFile: true;
  file(success: (file: File) => void, error?: (err: DOMException) => void): void;
}

interface WebkitDirectoryEntry extends WebkitEntry {
  isDirectory: true;
  createReader(): { readEntries(success: (entries: WebkitEntry[]) => void, error?: (err: DOMException) => void): void };
}

interface DirectoryPickerWindow {
  showDirectoryPicker?: (options?: { mode?: "read" }) => Promise<PickerDirectoryHandle>;
}

type PickerHandle = PickerFileHandle | PickerDirectoryHandle;

interface PickerFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
}

interface PickerDirectoryHandle {
  kind: "directory";
  name: string;
  entries(): AsyncIterableIterator<[string, PickerHandle]>;
}

const DEFAULT_IGNORE_TEXT = `
.git/
node_modules/
bower_components/
.next/
.nuxt/
.svelte-kit/
dist/
build/
coverage/
.cache/
.turbo/
.vercel/
.netlify/
target/
vendor/
*.log
.DS_Store
`;

export function Hud({
  state,
  send,
  hostMode,
}: {
  state: SidebarState;
  send: (e: ClientEvent) => void;
  hostMode: boolean;
}) {
  const lat = state.latencyMs != null ? (state.latencyMs / 1000).toFixed(2) + "s" : "0.00s";
  return (
    <div className="hud">
      <div className="lat-label">idea &rarr; artifact</div>
      <div className="lat-num">{lat}</div>
      <div>
        <div className="lat-sub">
          Cerebras &middot; <b>~1900 tok/s</b>
        </div>
        <div className={"lat-state" + (state.latencyMs ? " ok" : "")}>
          {state.running ? (state.latencyMs ? "✓ rendered live" : "generating…") : "standby"}
        </div>
      </div>
      <ContextDock state={state} send={send} hostMode={hostMode} />
    </div>
  );
}

function ContextDock({
  state,
  send,
  hostMode,
}: {
  state: SidebarState;
  send: (e: ClientEvent) => void;
  hostMode: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [filterNote, setFilterNote] = useState("");
  const self = state.presence.find((p) => p.id === state.selfId);
  const items = state.context.items;
  const pending = items.filter((i) => i.status === "pending");
  const accepted = items.filter((i) => i.status === "accepted");
  const mine = items.filter((i) => i.uploadedBy === state.selfId).slice(0, 3);

  const upload = async (incoming: UploadFile[] | FileList | null): Promise<void> => {
    const files = await normalizeUploadFiles(incoming);
    if (files.length === 0) return;
    setBusy(true);
    setError("");
    setFilterNote("");
    try {
      const filtered = await applyGitignore(files);
      const skipped = files.length - filtered.length;
      if (filtered.length === 0) {
        setError("Everything matched .gitignore");
        return;
      }
      setFilterNote(skipped ? `${filtered.length}/${files.length} files` : `${filtered.length} file${filtered.length === 1 ? "" : "s"}`);
      const form = new FormData();
      filtered.forEach(({ file, path }) => {
        form.append("files", file, file.name);
        form.append("paths", path);
      });
      form.append("uploaderId", state.selfId ?? "");
      form.append("uploaderName", self?.name ?? (hostMode ? "Host" : "Participant"));
      form.append("role", hostMode ? "host" : "viewer");
      form.append("title", titleFor(filtered));
      const res = await fetch(serverUrl("/context/upload"), { method: "POST", body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Upload failed (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      setDragging(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const chooseFolder = async (): Promise<void> => {
    const directoryPicker = (window as Window & DirectoryPickerWindow).showDirectoryPicker;
    if (!directoryPicker) {
      setFilterNote("");
      setError("Drop folders to apply .gitignore");
      return;
    }
    let submitted = false;
    setBusy(true);
    setError("");
    setFilterNote("");
    try {
      const directory = await directoryPicker.call(window, { mode: "read" });
      const files = await collectDirectoryHandle(directory, "", parseIgnoreRules(DEFAULT_IGNORE_TEXT, ""));
      submitted = true;
      await upload(files);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Folder scan failed");
    } finally {
      if (!submitted) setBusy(false);
    }
  };

  const onDrop = async (e: DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    setError("");
    try {
      const files = await collectDroppedFiles(e.dataTransfer);
      await upload(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Drop failed");
    }
  };

  const accept = (id: string): void => send({ type: "context.accept", id });
  const reject = (id: string): void => send({ type: "context.reject", id });
  const clear = (): void => send({ type: "context.clear" });
  const queue = hostMode ? pending.slice(0, 3) : mine;

  return (
    <div
      className={"contextDock" + (pending.length && hostMode ? " needs-review" : "") + (dragging ? " dragging" : "")}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => void onDrop(e)}
    >
      <input ref={fileRef} type="file" multiple hidden onChange={(e: ChangeEvent<HTMLInputElement>) => void upload(e.target.files)} />
      <div className="ctxTop">
        <span className="ctxK">context</span>
        <span className="ctxCount">
          {accepted.length} accepted
          {pending.length ? ` · ${pending.length} pending` : ""}
        </span>
        {hostMode && state.context.workspaceRoot ? <span className="ctxPath" title={state.context.workspaceRoot}>workspace</span> : null}
      </div>
      <div className="ctxDrop">
        <span>Drop files or folders</span>
        <b>.gitignore aware</b>
      </div>
      <div className="ctxActions">
        <button className="ctxBtn" disabled={busy} onClick={() => fileRef.current?.click()}>
          + file
        </button>
        <button className="ctxBtn" disabled={busy} onClick={() => void chooseFolder()}>
          + folder
        </button>
        {hostMode && items.length ? (
          <button className="ctxBtn subtle" disabled={busy} onClick={clear}>
            clear
          </button>
        ) : null}
        {busy ? <span className="ctxBusy">scanning</span> : error ? <span className="ctxErr">{error}</span> : filterNote ? <span className="ctxOk">{filterNote}</span> : null}
      </div>
      {queue.length ? (
        <div className="ctxQueue">
          {queue.map((item) => (
            <ContextRow key={item.id} item={item} hostMode={hostMode} onAccept={accept} onReject={reject} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ContextRow({
  item,
  hostMode,
  onAccept,
  onReject,
}: {
  item: ContextBundle;
  hostMode: boolean;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <div className={"ctxItem " + item.status}>
      <span className="ctxName" title={item.files.map((f) => f.relativePath).join("\n")}>
        {item.title}
      </span>
      <span className="ctxMeta">
        {item.uploadedByName} · {item.fileCount} file{item.fileCount === 1 ? "" : "s"} · {formatBytes(item.totalBytes)}
      </span>
      {hostMode && item.status === "pending" ? (
        <span className="ctxReview">
          <button onClick={() => onAccept(item.id)}>accept</button>
          <button onClick={() => onReject(item.id)}>reject</button>
        </span>
      ) : (
        <span className="ctxStatus">{item.status}</span>
      )}
    </div>
  );
}

async function normalizeUploadFiles(incoming: UploadFile[] | FileList | null): Promise<UploadFile[]> {
  if (!incoming) return [];
  if (Array.isArray(incoming)) return incoming;
  return Array.from(incoming).map((file) => ({
    file,
    path: normalizePath((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name),
  }));
}

async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<UploadFile[]> {
  const itemEntries = Array.from(dataTransfer.items)
    .map((item) => (item as unknown as { webkitGetAsEntry?: () => WebkitEntry | null }).webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is WebkitEntry => !!entry);
  if (itemEntries.length) {
    const rules = parseIgnoreRules(DEFAULT_IGNORE_TEXT, "");
    const groups = await Promise.all(itemEntries.map((entry) => collectEntry(entry, "", rules)));
    return groups.flat();
  }
  return Array.from(dataTransfer.files).map((file) => ({ file, path: normalizePath(file.name) }));
}

async function collectEntry(entry: WebkitEntry, parentPath: string, rules: IgnoreRule[]): Promise<UploadFile[]> {
  const entryPath = normalizePath(parentPath ? `${parentPath}/${entry.name}` : entry.name);
  if (isIgnored(entryPath, entry.isDirectory, rules)) return [];
  if (entry.isFile) {
    const file = await fileFromEntry(entry as WebkitFileEntry);
    return [{ file, path: entryPath }];
  }
  const directory = entry as WebkitDirectoryEntry;
  const children = await readDirectory(directory);
  const gitignore = children.find((child) => child.isFile && child.name === ".gitignore") as WebkitFileEntry | undefined;
  const nextRules = [...rules];
  if (gitignore) {
    const file = await fileFromEntry(gitignore);
    nextRules.push(...parseIgnoreRules(await file.text(), entryPath));
  }
  const groups = await Promise.all(children.map((child) => collectEntry(child, entryPath, nextRules)));
  return groups.flat();
}

function fileFromEntry(entry: WebkitFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readDirectory(entry: WebkitDirectoryEntry): Promise<WebkitEntry[]> {
  const reader = entry.createReader();
  const out: WebkitEntry[] = [];
  for (;;) {
    const batch = await new Promise<WebkitEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return out;
    out.push(...batch);
  }
}

async function collectDirectoryHandle(
  directory: PickerDirectoryHandle,
  parentPath: string,
  rules: IgnoreRule[],
): Promise<UploadFile[]> {
  const directoryPath = normalizePath(parentPath ? `${parentPath}/${directory.name}` : directory.name);
  if (isIgnored(directoryPath, true, rules)) return [];
  const entries: PickerHandle[] = [];
  for await (const [, child] of directory.entries()) entries.push(child);
  const gitignore = entries.find((child): child is PickerFileHandle => child.kind === "file" && child.name === ".gitignore");
  const nextRules = [...rules];
  if (gitignore) {
    const file = await gitignore.getFile();
    nextRules.push(...parseIgnoreRules(await file.text(), directoryPath));
  }
  const groups = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = normalizePath(`${directoryPath}/${entry.name}`);
      if (entry.kind === "file") {
        if (isIgnored(entryPath, false, nextRules)) return [];
        return [{ file: await entry.getFile(), path: entryPath }];
      }
      return collectDirectoryHandle(entry, directoryPath, nextRules);
    }),
  );
  return groups.flat();
}

async function applyGitignore(files: UploadFile[]): Promise<UploadFile[]> {
  const rules = parseIgnoreRules(DEFAULT_IGNORE_TEXT, "");
  await Promise.all(
    files
      .filter((f) => basename(f.path) === ".gitignore")
      .map(async ({ file, path }) => {
        rules.push(...parseIgnoreRules(await file.text(), dirname(path)));
      }),
  );
  return files.filter(({ path }) => !isIgnored(path, false, rules));
}

function parseIgnoreRules(text: string, base: string): IgnoreRule[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      let pattern = line;
      let negated = false;
      if (pattern.startsWith("!")) {
        negated = true;
        pattern = pattern.slice(1);
      }
      pattern = pattern.replace(/^\.\//, "");
      const dirOnly = pattern.endsWith("/");
      if (dirOnly) pattern = pattern.slice(0, -1);
      const anchored = pattern.startsWith("/");
      if (anchored) pattern = pattern.slice(1);
      return {
        base: normalizePath(base),
        pattern: normalizePath(pattern),
        negated,
        dirOnly,
        anchored,
        hasSlash: pattern.includes("/"),
      };
    })
    .filter((rule) => rule.pattern.length > 0);
}

function isIgnored(path: string, isDir: boolean, rules: IgnoreRule[]): boolean {
  const normalized = normalizePath(path);
  let ignored = false;
  for (const rule of rules) {
    if (rule.dirOnly && !isDir && !containsDirSegment(normalized, rule)) continue;
    if (matchesRule(normalized, isDir, rule)) ignored = !rule.negated;
  }
  return ignored;
}

function matchesRule(path: string, isDir: boolean, rule: IgnoreRule): boolean {
  const rel = relativeToBase(path, rule.base);
  if (rel == null) return false;
  const candidates = rule.hasSlash || rule.anchored ? [rel] : pathSegments(rel);
  const regex = globToRegex(rule.pattern, rule.hasSlash || rule.anchored);
  if (rule.dirOnly) {
    if (isDir && candidates.some((candidate) => regex.test(candidate))) return true;
    return candidates.some((candidate) => candidate === rule.pattern || candidate.startsWith(`${rule.pattern}/`));
  }
  return candidates.some((candidate) => regex.test(candidate));
}

function containsDirSegment(path: string, rule: IgnoreRule): boolean {
  const rel = relativeToBase(path, rule.base);
  if (rel == null) return false;
  if (rule.hasSlash || rule.anchored) return rel === rule.pattern || rel.startsWith(`${rule.pattern}/`);
  return pathSegments(rel).some((segment) => segment === rule.pattern || segment.startsWith(`${rule.pattern}/`));
}

function relativeToBase(path: string, base: string): string | null {
  if (!base) return path;
  if (path === base) return "";
  return path.startsWith(`${base}/`) ? path.slice(base.length + 1) : null;
}

function globToRegex(pattern: string, fullPath: boolean): RegExp {
  const escaped = pattern
    .split("")
    .map((ch) => {
      if (ch === "*") return "[^/]*";
      if (ch === "?") return "[^/]";
      return /[\\^$+?.()|[\]{}]/.test(ch) ? `\\${ch}` : ch;
    })
    .join("");
  return new RegExp(fullPath ? `^${escaped}(?:/.*)?$` : `^${escaped}$`);
}

function titleFor(files: UploadFile[]): string {
  if (files.length === 1) return files[0]?.path || files[0]?.file.name || "Context file";
  const folder = files[0]?.path.split("/")[0];
  return folder ? `${folder} (${files.length} files)` : `${files.length} files`;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function dirname(path: string): string {
  const normalized = normalizePath(path);
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? "" : normalized.slice(0, idx);
}

function basename(path: string): string {
  return normalizePath(path).split("/").pop() || path;
}

function pathSegments(path: string): string[] {
  const parts = normalizePath(path).split("/").filter(Boolean);
  return parts.flatMap((part, i) => [part, parts.slice(i).join("/")]);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function serverUrl(path: string): string {
  const explicitWs = import.meta.env.VITE_WS_URL as string | undefined;
  if (explicitWs) {
    const url = new URL(explicitWs);
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.pathname = path;
    url.search = "";
    return url.toString();
  }
  if (location.port === "5173") return `${location.protocol}//${location.hostname}:3001${path}`;
  return path;
}

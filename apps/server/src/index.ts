import type { ServerWebSocket } from "bun";
import { existsSync, realpathSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { config, assertLiveReady } from "./config";
import { Session, type WsData } from "./session";
import { room } from "./room";

assertLiveReady();

/** Constant-time string compare (avoids leaking the password via timing). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** True when no password is configured, or the request carries the right one. */
function authed(req: Request, url: URL): boolean {
  if (!config.meetingPassword) return true;
  const key = req.headers.get("x-sidebar-key") ?? url.searchParams.get("key") ?? "";
  return safeEqual(key, config.meetingPassword);
}

const webRoot = resolve(process.cwd(), "apps/web/dist");
// Real (symlink-resolved) web root for the containment check; falls back to the
// plain path if dist isn't built yet (realpathSync throws on a missing dir).
const realWebRoot = (() => {
  try {
    return realpathSync(webRoot);
  } catch {
    return webRoot;
  }
})();

/** True only when `target` is webRoot itself or a path strictly inside it. */
function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + sep);
}
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function serveWeb(pathname: string): Response {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return new Response("Bad Request", { status: 400 }); // malformed %-escape
  }
  const rel = decoded.replace(/^\/+/, "") || "index.html";
  const target = resolve(webRoot, rel);
  // Boundary check on a path separator (not a bare prefix) so a sibling dir like
  // "dist-secret" can't satisfy startsWith(".../dist").
  if (!isInside(webRoot, target)) return new Response("Forbidden", { status: 403 });

  if (existsSync(target) && statSync(target).isFile()) {
    // Re-check after resolving symlinks so a symlink inside dist can't escape it.
    if (!isInside(realWebRoot, realpathSync(target))) return new Response("Forbidden", { status: 403 });
    return new Response(Bun.file(target), {
      headers: { "content-type": mime[extname(target)] ?? "application/octet-stream" },
    });
  }

  const index = resolve(webRoot, "index.html");
  if (existsSync(index)) {
    return new Response(Bun.file(index), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return new Response(
    "Sidebar server is running. Build the web app with `bun run build`, then open this URL again.",
    { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

/** POST to ElevenLabs for a 15-min single-use Scribe Realtime token (key stays here). */
async function mintScribeToken(): Promise<Response> {
  if (!config.elevenLabsApiKey) {
    return Response.json(
      { error: "ELEVENLABS_API_KEY not set — set it in .env to use ElevenLabs ASR (the browser falls back to Web Speech)." },
      { status: 503 },
    );
  }
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", {
      method: "POST",
      // ElevenLabs requires a Content-Length; send an explicit empty body so a
      // bodyless POST doesn't 411.
      headers: { "xi-api-key": config.elevenLabsApiKey, "content-length": "0" },
      body: "",
    });
    if (!res.ok) {
      return Response.json({ error: `ElevenLabs token mint failed (HTTP ${res.status})` }, { status: 502 });
    }
    const { token } = (await res.json()) as { token: string };
    return Response.json({ token });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "token mint failed" }, { status: 502 });
  }
}

/** Transcribe one WAV clip with local Gemma 4 E4B via Ollama's OpenAI-compatible API. */
async function gemmaTranscribe(req: Request): Promise<Response> {
  let audio: string;
  try {
    audio = ((await req.json()) as { audio_base64?: string }).audio_base64 ?? "";
  } catch {
    return Response.json({ error: "bad request body" }, { status: 400 });
  }
  if (!audio) return Response.json({ error: "no audio" }, { status: 400 });
  try {
    const res = await fetch(`${config.ollamaUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: config.gemmaAsrModel,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe the speech in this audio verbatim. Output only the transcription, no preamble." },
              { type: "input_audio", input_audio: { data: audio, format: "wav" } },
            ],
          },
        ],
        stream: false,
        temperature: 0,
        think: false, // avoid the v0.30.x audio thinking regression (ollama#16584)
      }),
    });
    if (!res.ok) return Response.json({ error: `Ollama HTTP ${res.status}` }, { status: 502 });
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return Response.json({ text: (data.choices?.[0]?.message?.content ?? "").trim() });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "gemma asr failed" }, { status: 502 });
  }
}

const server = Bun.serve<WsData>({
  port: config.port,
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      // Gate the live experience behind the meeting password (host + guests).
      if (!authed(req, url)) return new Response("Unauthorized", { status: 401 });
      if (srv.upgrade(req, { data: { session: null } })) return undefined;
      return new Response("WebSocket upgrade failed", { status: 426 });
    }
    if (url.pathname === "/health") {
      return Response.json({ ok: true, agents: config.agents, source: config.source, model: config.modelId });
    }
    // Auth probe for the lock screen: is a password required, and is this key valid?
    if (url.pathname === "/gate") {
      return Response.json({ required: !!config.meetingPassword, authed: authed(req, url) });
    }
    if (url.pathname === "/context/upload" && req.method === "OPTIONS") return room.contextOptions();
    if (url.pathname === "/context/upload" && req.method === "POST") {
      if (!authed(req, url)) return new Response("Unauthorized", { status: 401, headers: { "access-control-allow-origin": "*" } });
      return room.uploadContext(req);
    }
    // Mint a single-use ElevenLabs Scribe v2 Realtime token so the browser can
    // stream mic audio directly to ElevenLabs without ever seeing the API key.
    if (url.pathname === "/asr/token") {
      if (!authed(req, url)) return new Response("Unauthorized", { status: 401 });
      return mintScribeToken();
    }
    // On-device ASR: proxy a WAV clip to local Gemma 4 E4B on Ollama.
    if (url.pathname === "/asr/gemma" && req.method === "POST") {
      if (!authed(req, url)) return new Response("Unauthorized", { status: 401 });
      return gemmaTranscribe(req);
    }
    return serveWeb(url.pathname);
  },
  websocket: {
    open(ws: ServerWebSocket<WsData>) {
      ws.data.session = new Session(ws);
    },
    message(ws: ServerWebSocket<WsData>, msg) {
      ws.data.session?.onMessage(typeof msg === "string" ? msg : msg.toString());
    },
    close(ws: ServerWebSocket<WsData>) {
      ws.data.session?.dispose();
      ws.data.session = null;
    },
  },
});

console.log(
  `▚ Sidebar server on :${server.port}  (agents=${config.agents}, source=${config.source}, model=${config.modelId})`,
);

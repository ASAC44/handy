import type { ServerWebSocket } from "bun";
import { config, assertLiveReady } from "./config";
import { Session, type WsData } from "./session";

assertLiveReady();

const server = Bun.serve<WsData>({
  port: config.port,
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (srv.upgrade(req, { data: { session: null } })) return undefined;
      return new Response("WebSocket upgrade failed", { status: 426 });
    }
    if (url.pathname === "/health") {
      return Response.json({ ok: true, agents: config.agents, source: config.source, model: config.modelId });
    }
    return new Response("Sidebar server — connect a WebSocket to /ws", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
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

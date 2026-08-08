import type { ServerWebSocket } from "bun";
import { room } from "./room";

export interface WsData {
  session: Session | null;
}

/** Thin WebSocket adapter; all meeting state lives in the shared room. */
export class Session {
  constructor(private ws: ServerWebSocket<WsData>) {
    room.open(ws);
  }

  onMessage(raw: string): void {
    room.receive(raw);
  }

  dispose(): void {
    room.close(this.ws);
  }
}

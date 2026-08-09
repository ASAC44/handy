import type { ServerWebSocket } from "bun";
import { room } from "./room";

/** Outcome of authenticating a connection's `?key=`/`x-sidebar-key`, captured onto
 *  the socket at upgrade time. `role` is set only in locked mode (host passcode or a
 *  valid invite code matched) and is then SERVER-AUTHORITATIVE — the client can no
 *  longer self-assert host via a URL flag. In open mode `role` is undefined and the
 *  legacy client-asserted role (`?host`) is honoured (local dev has nothing to gate). */
export interface AuthResult {
  ok: boolean;
  role?: "host" | "viewer";
  /** Which invite code authorized this viewer (for naming + kick-revocation). */
  inviteId?: string;
  /** The guest's seat label from their invite (e.g. "Guest 2"). */
  label?: string;
}

export interface WsData {
  session: Session | null;
  auth: AuthResult;
}

/** Thin WebSocket adapter; all meeting state lives in the shared room. */
export class Session {
  constructor(private ws: ServerWebSocket<WsData>) {
    room.open(ws);
  }

  onMessage(raw: string): void {
    room.receive(raw, this.ws);
  }

  dispose(): void {
    room.close(this.ws);
  }
}

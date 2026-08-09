/**
 * Meeting-password plumbing for the client. The server is the real gate (it
 * rejects the WS + ASR + upload endpoints without the key); this just carries the
 * key the user typed on the lock screen and asks the server whether one is needed.
 */
const STORE_KEY = "sidebar.key";

export function getKey(): string {
  try {
    return sessionStorage.getItem(STORE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Seed the key from `?key=...` (invite link) ONCE — never clobber a key the user
 *  has already entered on the lock screen. Call once at startup. */
export function seedKeyFromUrl(): void {
  try {
    if (sessionStorage.getItem(STORE_KEY)) return;
    const fromUrl = new URLSearchParams(location.search).get("key");
    if (fromUrl) sessionStorage.setItem(STORE_KEY, fromUrl);
  } catch {
    /* storage disabled */
  }
}

export function setKey(k: string): void {
  try {
    sessionStorage.setItem(STORE_KEY, k);
  } catch {
    /* private mode / storage disabled — key just won't persist */
  }
}

/** Drop the stored key (e.g. after being kicked) so a reload requires the password again. */
export function clearKey(): void {
  try {
    sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* storage disabled */
  }
}

/** Header to attach to same-origin fetches (ASR token, Gemma, context upload). */
export function authHeaders(): Record<string, string> {
  const k = getKey();
  return k ? { "x-sidebar-key": k } : {};
}

export interface GateInfo {
  required: boolean;
  authed: boolean;
}

/** Ask the server whether a password is required and whether `key` satisfies it. */
export async function checkGate(key: string): Promise<GateInfo> {
  const u = new URL("/gate", location.href);
  if (key) u.searchParams.set("key", key);
  const res = await fetch(u.toString(), { signal: AbortSignal.timeout(6000) });
  return (await res.json()) as GateInfo;
}

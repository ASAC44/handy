import { useEffect, useRef, useState } from "react";
import type { ClientEvent, InviteInfo } from "@sidebar/shared";
import type { SidebarState } from "../ws";

/**
 * Host-only "invite participants" control. Each guest gets a UNIQUE, server-minted
 * invite code (the host clicks "New invite link" to mint one); the resulting URL
 * carries that code as `?key=` so the guest authenticates as a viewer — distinct from
 * the host's own passcode. Codes are live state (state.invites): mint, copy, revoke.
 *
 * The surface is a centered modal dialog (animated in/out) so it never clips off the
 * top of the screen from the masthead.
 */
function inviteUrl(code: string): string {
  try {
    const u = new URL(location.href);
    u.search = "";
    u.hash = "";
    u.searchParams.set("key", code);
    return u.toString();
  } catch {
    return `${location.origin}/?key=${encodeURIComponent(code)}`;
  }
}

function isLocalOrigin(): boolean {
  const h = location.hostname;
  return h === "localhost" || h === "0.0.0.0" || h === "::1" || h.startsWith("127.") || h.endsWith(".local");
}

const EXIT_MS = 200; // keep in sync with the .modalScrim transition in styles.css

export function InviteButton({ state, send }: { state: SidebarState; send: (e: ClientEvent) => void }) {
  const [mounted, setMounted] = useState(false); // in the DOM (kept during exit animation)
  const [shown, setShown] = useState(false); // drives the enter/exit transition
  const local = isLocalOrigin();
  const invites = state.invites.filter((i) => !i.revoked);

  const open = (): void => {
    setMounted(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
  };
  const close = (): void => {
    setShown(false);
    setTimeout(() => setMounted(false), EXIT_MS);
  };

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mounted]);

  return (
    <>
      <button className="capBtn primary" onClick={open} data-tip="Invite participants">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-mail-plus-icon lucide-mail-plus"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="M19 16v6"/><path d="M16 19h6"/></svg>
        Invite{invites.length ? ` · ${invites.length}` : ""}
      </button>
      {mounted ? (
        <div className={"modalScrim" + (shown ? " show" : "")} role="presentation" onClick={close}>
          <div
            className="modalCard inviteModal"
            role="dialog"
            aria-modal="true"
            aria-label="Invite participants"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modalClose" onClick={close} aria-label="Close" data-tip="Close">
              &times;
            </button>
            <div className="modalHead">
              <div className="modalK">invite</div>
              <h3 className="modalTitle">Invite participants</h3>
              <p className="modalSub">Each link carries a unique guest code — share one per person.</p>
            </div>
            {invites.length ? (
              <div className="inviteList">
                {invites.map((inv) => (
                  <InviteRow key={inv.id} invite={inv} onRevoke={() => send({ type: "invite.revoke", id: inv.id })} />
                ))}
              </div>
            ) : (
              <div className="inviteEmpty">No invite links yet. Create one to add a guest.</div>
            )}
            <div className="modalActions">
              <button className="capBtn primary" style={{ flex: 1 }} onClick={() => send({ type: "invite.create" })}>
                + New invite link
              </button>
            </div>
            {local ? (
              <div className="inviteWarn">
                Local URL — others can&rsquo;t reach it. Run <b>bun run host</b> then <b>bun run serve</b> (tailnet) or{" "}
                <b>bun run funnel</b> (public), and open the Tailscale URL to share.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function InviteRow({ invite, onRevoke }: { invite: InviteInfo; onRevoke: () => void }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const url = inviteUrl(invite.code);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      inputRef.current?.select(); // clipboard blocked (insecure context) — select to copy manually
    }
  };

  return (
    <div className="inviteItem">
      <span className="inviteLabel">{invite.label}</span>
      <input
        ref={inputRef}
        readOnly
        className="inviteUrl"
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={`Invite link for ${invite.label}`}
      />
      <button className="capBtn" onClick={() => void copy()} data-tip="Copy this guest's link">
        {copied ? "Copied ✓" : "Copy"}
      </button>
      <button className="capBtn subtle" onClick={onRevoke} data-tip="Revoke this invite — removes the guest and disables the link">
        Revoke
      </button>
    </div>
  );
}

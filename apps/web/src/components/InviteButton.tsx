import { useEffect, useRef, useState } from "react";

/**
 * Host-only "invite participants" control. Produces the viewer URL — the current
 * origin (which is the Tailscale serve/funnel host when running behind it), with
 * the `host` flag stripped so guests open in viewer mode — and lets the host copy
 * it or fire the native share sheet. Same-origin app, so this one link carries WS
 * + /asr through Tailscale with no extra config.
 *
 * The link surface is a centered modal dialog (animated in/out) rather than a
 * popover, so it never clips off the top of the screen from the masthead.
 */
function viewerUrl(): string {
  try {
    const u = new URL(location.href);
    u.searchParams.delete("host");
    u.hash = "";
    return u.toString().replace(/\?$/, "");
  } catch {
    return location.origin;
  }
}

function isLocalOrigin(): boolean {
  const h = location.hostname;
  return h === "localhost" || h === "0.0.0.0" || h === "::1" || h.startsWith("127.") || h.endsWith(".local");
}

const canShare = (): boolean => typeof navigator !== "undefined" && typeof navigator.share === "function";

const EXIT_MS = 200; // keep in sync with the .modalScrim transition in styles.css

export function InviteButton() {
  const [mounted, setMounted] = useState(false); // in the DOM (kept during exit animation)
  const [shown, setShown] = useState(false); // drives the enter/exit transition
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const url = viewerUrl();
  const local = isLocalOrigin();

  const open = (): void => {
    setMounted(true);
    // Two frames so the browser paints the hidden state before we transition in.
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

  useEffect(() => {
    if (shown) inputRef.current?.select();
  }, [shown]);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked (insecure context) — the URL is still shown to copy manually */
    }
  };

  const share = async (): Promise<void> => {
    if (canShare()) {
      try {
        await navigator.share({ title: "Join the Sidebar meeting", text: "Live dashboard:", url });
        return;
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    void copy();
  };

  return (
    <>
      <button className="capBtn primary" onClick={open} data-tip="Invite participants">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-mail-plus-icon lucide-mail-plus"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="M19 16v6"/><path d="M16 19h6"/></svg>
        Invite
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
              <p className="modalSub">Share this link — it opens in viewer mode.</p>
            </div>
            <input
              ref={inputRef}
              readOnly
              className="inviteUrl"
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Invite link"
            />
            <div className="modalActions">
              <button className="capBtn primary" style={{ flex: 1 }} onClick={() => void copy()}>
                {copied ? "Copied ✓" : "Copy link"}
              </button>
              {canShare() ? (
                <button className="capBtn" style={{ flex: 1 }} onClick={() => void share()}>
                  Send…
                </button>
              ) : null}
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

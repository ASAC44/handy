import { useState } from "react";

/**
 * Host-only "invite participants" control. Produces the viewer URL — the current
 * origin (which is the Tailscale serve/funnel host when running behind it), with
 * the `host` flag stripped so guests open in viewer mode — and lets the host copy
 * it or fire the native share sheet. Same-origin app, so this one link carries WS
 * + /asr through Tailscale with no extra config.
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

export function InviteButton() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = viewerUrl();
  const local = isLocalOrigin();

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
    <div className="invite" style={{ position: "relative" }}>
      <button className="capBtn primary" onClick={() => setOpen((o) => !o)} title="Invite participants">
        Invite
      </button>
      {open ? (
        <div
          className="invitePop"
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            width: 290,
            padding: 12,
            background: "var(--surface, #161b2e)",
            border: "1px solid var(--border, #2a3350)",
            borderRadius: 10,
            boxShadow: "0 10px 30px rgba(0,0,0,.5)",
            zIndex: 60,
          }}
        >
          <div style={{ fontSize: 11, color: "var(--mut, #8d9bb5)", marginBottom: 6 }}>
            Share this link — opens in viewer mode
          </div>
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Invite link"
            style={{
              width: "100%",
              boxSizing: "border-box",
              fontSize: 12,
              padding: "6px 8px",
              background: "rgba(255,255,255,.06)",
              border: "1px solid var(--border, #2a3350)",
              borderRadius: 6,
              color: "var(--ink, #e8edf7)",
            }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
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
            <div style={{ fontSize: 10.5, color: "#ffb454", marginTop: 8, lineHeight: 1.4 }}>
              Local URL — others can't reach it. Run <b>bun run host</b> then <b>bun run serve</b> (tailnet) or{" "}
              <b>bun run funnel</b> (public), and open the Tailscale URL to share.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

import type { CSSProperties } from "react";

type ParticipantCursorProps = {
  color: string;
  name: string;
  x: number;
  y: number;
};

export function ParticipantCursor({ color, name, x, y }: ParticipantCursorProps) {
  return (
    <div className="remote-cursor" style={{ left: x, top: y, "--pc": color } as CSSProperties}>
      <svg className="cursor-arrow" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 2.5 20 11.2l-7.6 2.1-3.5 7.2L3 2.5Z" />
      </svg>
      <span className="cursor-label">{name}</span>
    </div>
  );
}

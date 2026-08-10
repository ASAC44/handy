import type { ClientEvent, ParticipantPresence } from "@handy/shared";
import { X } from "lucide-react";
import { initials } from "../lib/initials";
import type { HandyState } from "../ws";
import { Button } from "./ui/button";

export function RoomPresence({
  state,
  send,
  hostMode,
}: {
  state: HandyState;
  send: (event: ClientEvent) => void;
  hostMode: boolean;
}) {
  const kick = (participant: ParticipantPresence): void => {
    if (confirm(`Remove ${participant.name} from the meeting?`)) {
      send({ type: "host.kick", id: participant.id });
    }
  };

  return (
    <div className="roomPresence" aria-label={`${state.presence.length} online`}>
      <span className="presence-title">Room</span>
      <div className="presence-avatars">
        {state.presence.map((participant) => {
          const isSelf = participant.id === state.selfId;
          const canKick = hostMode && !isSelf;
          return (
            <span
              key={participant.id}
              className={`presence-avatar${isSelf ? " self" : ""}${canKick ? " kickable" : ""}`}
              style={{ background: participant.color }}
              data-tip={isSelf ? `${participant.name} (you)` : canKick ? `${participant.name} — remove` : participant.name}
            >
              {initials(participant.name)}
              {canKick ? (
                <Button variant="destructive" size="icon-xs" className="presence-kick" aria-label={`Remove ${participant.name}`} onClick={() => kick(participant)}>
                  <X aria-hidden="true" />
                </Button>
              ) : null}
            </span>
          );
        })}
      </div>
      <span className="presence-count">{state.presence.length} online</span>
    </div>
  );
}

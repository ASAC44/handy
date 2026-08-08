# Meeting fixtures (realism set)

Naturalistic meeting audio for **realistic ASR + demo** — people having their normal
meeting, where the buildable intent surfaces as messy, half-formed talk and **nobody
is prompting the agent**. This set is deliberately **separate** from
[`test-transcripts.json`](../../test-transcripts.json), which stays the clean agent
gold-label fixture (router/summary/factcheck/prototype expectations).

Rendered with **ElevenLabs v3** — expressive delivery via audio tags (`[sighs]`,
`[laughs]`, `[overlapping]`, `[strong French accent]`), pauses (`…`), emphasis (CAPS),
and code-switching.

## What's here

```
fixtures/meetings/
  scripts.json            # the authored scenarios (say = TTS text w/ tags, text = clean gold)
  manifest.json           # generated: clips + meeting tracks + per-clip gold/lang/kind
  <scenario>/NN-Speaker.wav  # clean per-utterance clips (single voice) -> WER
  <scenario>/meeting.wav     # realistic MIX: crosstalk turns genuinely overlap (ducked PCM)
```

Scenarios: `standup-curveball` (EN, casual), `growth-sync-ptbr` (Brazilian Portuguese
+ code-switched jargon), `launch-room-accents` (EN with a French accent + heavy
cross-talk). Each buries one buildable intent (a blockers board / a metrics dashboard /
a dark landing page) plus off-topic chatter the router should skip.

## Two tracks, on purpose

- **Clean clips** (`NN-Speaker.wav`) are single-voice, full quality — scored for WER
  (`bun run meetings:bench`). Gold for accented speech is the **standard** words a human
  transcriber writes (e.g. "the page", not the phonetic "ze page").
- **`meeting.wav`** is the realistic mix with true simultaneous cross-talk (overlapping
  PCM + ducking) — for demos and streaming-ASR stress. It is **not** WER-scored: there
  is no single ground truth across overlapping speech.

## Generate / regenerate

```bash
bun run meetings:gen           # needs ELEVENLABS_API_KEY with text_to_speech permission
bun run meetings:gen --smoke   # 1 EN + 1 PT-BR probe, validates v3, writes nothing
```

**v3 is nondeterministic** (`seed` is best-effort only), so a regen is a *new* fixture —
re-commit it. The committed bytes are the deterministic anchor; the bench never calls
the network.

> ⚠️ Audio is generated but **not auditioned by tooling** — voice casting and the
> Portuguese / French-accent quality should be ear-checked. Swap `voice_id`s in
> `scripts.json` and regenerate if a voice doesn't land.

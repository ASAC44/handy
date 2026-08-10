# 60-second demo — recording runbook

**The idea:** the meeting context everyone already shares is pre-loaded as a *file*
(`shared-context.md`), the canvas starts **empty**, and a short clip of **real meeting
audio plays out loud** while the agents build a grounded dashboard **from scratch** —
spoken idea → running artifact in ~2s on Cerebras.

Nothing here needs new code. The app already plays a `.wav` through the live ASR pipeline
*and routes it to the speakers* for exactly this (`apps/web/src/asr/audioSource.ts` →
"so it's audible for a demo recording").

## Assets in this folder

| File | What | Use |
| --- | --- | --- |
| `shared-context.md` | The pre-loaded shared notes (real churn 4.1%, MRR $142k, retention, OKRs) | Upload as host context before recording |
| `growth-sync-clip-short.wav` | **26s** — clips 12–14: "out of date" → the dashboard wish → "updates itself" | Recommended for a tight 60s cut |
| `growth-sync-clip-rich.wav` | **53s** — clips 08–15: the fact-check benchmark claim + pain points + wish + "death to CSVs" | To feature multi-agent activity (fact-check + summary + build); needs a looser cut or fast editing |

Both are clean per-utterance audio concatenated (not the overlapping `meeting.wav` mix) —
**better ASR accuracy**, so the router reliably catches the dashboard intent.

## Pre-flight (before you hit record)

1. **Live + speed:** `.env` already has `AGENTS=live` (real Cerebras/Gemma). Good.
2. **(Optional) GPU side-by-side:** start Ollama with `gemma4:31b-it-qat` so the A/B race
   can render Cerebras vs GPU. *Note:* the A/B race only runs on a build **after** the
   Design DNA is learned — i.e. the *second* build, not the first from-scratch one. See
   "Cut B" below. For a single-build 60s cut you can skip this.
3. Launch the app (`docker compose up` or `bun run dev`) and open it as **host**.
4. **Pick a playback-capable ASR engine** in the participant mic control: **Gemma (local)**
   or **Whisper (GPU)**. The "play a recording" path is disabled for Web Speech /
   ElevenLabs (`engineSupportsPlayback`).
5. **Privacy** (the brief checks this): clean browser profile, hide bookmarks, **disable
   OS/site notifications**, no API keys or other tabs visible. Full-screen the app.

## Set up the shot (order matters — two gotchas)

> ⚠️ **Clear wipes context.** `meeting.clear` also clears uploaded files
> (`room.ts` → `clearMeeting` calls `context.clear()`). So upload the notes *after* any
> clear. ⚠️ **Host uploads auto-accept**; guest uploads sit "pending". Upload as host.

1. **Go live** (top bar → *Go live*). Canvas is empty — that's the point.
2. **Upload the context:** Context panel → add `demo/shared-context.md`. As host it shows
   **accepted** immediately. Confirm the chip is there — that's what grounds the build.
3. Leave the canvas empty. Do **not** pre-build anything.
4. Start your screen recorder (OBS / built-in), target ≤60s.

## The take — Cut A (recommended, single build, ~50s)

1. **(0:00–0:03)** Hold on the empty meeting: the accepted notes chip, the idle agents.
2. **(0:03)** In the mic control, **"play a recording"** → `growth-sync-clip-short.wav`.
   Audio plays aloud; transcript + rolling summary fill in. *Nobody is prompting the agent.*
3. **(~0:25)** Lena's wish — *"one screen… the churn over time with a line for where we
   want to be, the MRR, and who's still with us… split it SMB versus mid-market"* — lands
   (clip 13 is ~18s, so it plays 0:06→0:25, then "updates itself" plays over the build).
   Router fires → **3 dashboards fan out from a blank canvas**, each already showing the
   *real* numbers from the notes (churn 4.1% with the 3.5% goal line, MRR $142k, retention,
   SMB-vs-mid-market split).
4. **(~0:30)** **Click the recommended variant** → "Design DNA learned"; the chosen
   dashboard finalizes. The card shows the **idea→artifact time (~2s)** on the Cerebras badge.
5. **(0:34–0:50)** Slow push-in on the finished, grounded dashboard. Lower-third:
   *"Cerebras + Gemma 4 — a spoken wish to a running, data-grounded dashboard in ~2s."*

## The take — Cut B (adds the GPU side-by-side, ~60s, tighter)

Do Cut A through step 4, then:

6. **(~0:38)** Type one tweak in the manual line (e.g. *"make it dark and add a WAU tile"*)
   or play one more short utterance. Because DNA is now learned, this is an **evolve**
   build and the **A/B race** runs: Cerebras finishes in ~2s while the Ollama/GPU card is
   still streaming — the side-by-side the brief recommends.
7. **(~0:55)** Land on the updated dashboard + the two timers.

## Tips

- **Fact-check is now a feature, not noise.** The `rich` clip includes Priya's benchmark
  line — *"isn't healthy SaaS churn supposed to be under three percent?"* (clip 08) — which
  is meant to trip the live Tavily fact-check agent for a real-search multi-agent beat. If
  you use the `short` clip you skip it; if it ever misfires distractingly, toggle the
  **fact-check agent off** before the take.
- **Re-takes:** *Go live* again to reset the room to empty, then re-upload the notes
  (remember: clear/relive drops context). The clips are deterministic, so every take is identical.
- **Trim differently?** Regenerate with ffmpeg, e.g. just the wish:
  `ffmpeg -i fixtures/meetings/growth-sync-en/13-Lena.wav -i .../14-Marcus.wav -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1[o]" -map "[o]" -ar 16000 -ac 1 demo/clip.wav`
  (clip 13 = the wish, 14 = "updates itself"; see `fixtures/meetings/scripts.json` for the full turn list)
- Caption the moment the dashboard appears with the **measured** latency from the card, not
  a guessed number — it's real Cerebras inference.

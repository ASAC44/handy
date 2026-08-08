# Audio fixtures

Deterministic meeting audio for ASR testing. Each clip is **16 kHz mono 16-bit WAV**
— the exact format both ASR paths consume (ElevenLabs Scribe `pcm_16000`, Gemma
`input_audio`), so no resampling happens at test time.

```
fixtures/audio/
  manifest.json            # voice map + per-clip gold text & metadata
  <scenario>/NN-Speaker.wav  # one clip per transcript segment
  <scenario>/full.wav        # the whole meeting, clips spaced by ~350ms silence
```

## How it's made

`scripts/gen-fixture-audio.ts` reads [`test-transcripts.json`](../../test-transcripts.json),
assigns each participant a distinct ElevenLabs voice, and synthesizes every segment's
`text`. It is run **once** and the output is committed — the committed bytes are the
fixture, so tests never call ElevenLabs (no key, no network, no cost, no drift).

```bash
bun run asr:gen          # regenerate everything (needs ELEVENLABS_API_KEY)
bun run asr:gen --smoke  # one real TTS call to sanity-check the API, writes nothing
```

Regeneration is pinned (fixed model + `seed` + voice map recorded in `manifest.json`),
but ElevenLabs does not guarantee bit-identical output across model updates — treat a
regenerated set as a *new* fixture and re-commit it.

## How it's used

`scripts/asr-bench.ts` runs the clips through local Gemma 4 E4B (Ollama) and scores
word error rate (WER) against the gold transcripts:

```bash
bun run asr:bench                          # needs Ollama + the Gemma audio model
bun run asr:bench --scenario sprint-planning
```

**Determinism:** the audio input is fully deterministic (committed bytes); Gemma at
temperature 0 is reproducible. A cloud ASR (e.g. Scribe) would get the same fixed
input but is a remote service whose output can drift over time.

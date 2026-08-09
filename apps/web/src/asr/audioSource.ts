/**
 * The audio source feeding the energy-VAD providers (gemmaLocal / whisperWebgpu).
 * Both providers run the identical VAD → segment → decode loop off a single
 * AudioNode; the only thing that differs is where that node's samples come from:
 *
 *   - micSource:  the live microphone (a MediaStreamSource)
 *   - fileSource: a recording played back through the same context as if it were
 *                 the mic — so an existing meeting.wav decodes through the real
 *                 live pipeline (clean, repeatable demos; recording playback).
 *
 * decodeAudioData resamples to the context's sampleRate (16 kHz), and the 1-channel
 * ScriptProcessor downmixes, so a stereo or 48 kHz file Just Works.
 */
export interface WiredSource {
  /** Connect this into the VAD ScriptProcessor. */
  node: AudioNode;
  /** Total length in seconds (file playback only; 0 for the open-ended mic). */
  durationSec: number;
  /** Seconds elapsed since playback started (file playback only; always 0 for mic). */
  elapsedSec(): number;
  /** Release the mic / stop playback. Safe to call repeatedly. */
  stop(): void;
}

/** A recording to decode through the live pipeline. */
export interface Playback {
  data: ArrayBuffer;
  label: string;
}

/** Live microphone wired into `ctx`. */
export async function micSource(ctx: AudioContext): Promise<WiredSource> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone unavailable — open over https:// or http://localhost (secure context required)");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  return {
    node: ctx.createMediaStreamSource(stream),
    durationSec: 0,
    elapsedSec: () => 0,
    stop: () => stream.getTracks().forEach((t) => t.stop()),
  };
}

/** Plays `pb` through `ctx` as a one-shot source. `onEnded` fires when the clip
 *  finishes so the caller can flush the last utterance and reset the UI. */
export async function fileSource(ctx: AudioContext, pb: Playback, onEnded: () => void): Promise<WiredSource> {
  // decodeAudioData detaches the buffer it's given — copy so the caller can replay.
  const buffer = await ctx.decodeAudioData(pb.data.slice(0));
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  // Route the recording to the speakers too, so it's audible for a demo recording. (The
  // VAD path is a separate, muted tap the provider wires from `node`.) The mic never does
  // this — playing the mic back to the speakers would feed back.
  const monitor = ctx.createGain();
  src.connect(monitor);
  monitor.connect(ctx.destination);
  let stopped = false;
  src.onended = () => {
    if (!stopped) onEnded();
  };
  const startedAt = ctx.currentTime;
  src.start();
  return {
    node: src,
    durationSec: buffer.duration,
    elapsedSec: () => Math.max(0, ctx.currentTime - startedAt),
    stop: () => {
      stopped = true;
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      try {
        monitor.disconnect();
      } catch {
        /* already detached */
      }
    },
  };
}

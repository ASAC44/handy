import type { AsrCallbacks, AsrProvider } from "./types";

/**
 * Browser-native Web Speech API provider (Chrome/Edge). Free and zero-setup, but
 * lower accuracy than Scribe and unavailable in some browsers — kept as the
 * fallback behind the same seam.
 */
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export function webSpeechAvailable(): boolean {
  return typeof window !== "undefined" && !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);
}

export class WebSpeechProvider implements AsrProvider {
  readonly id = "webspeech" as const;
  readonly label = "Browser (Web Speech)";
  private rec: SpeechRecognitionLike | null = null;
  private wants = false;
  private muted = false;

  setMuted(muted: boolean): void {
    // Web Speech is cloud (Google) regardless, so for push-to-talk we just drop
    // results while muted rather than fight Chrome's stop/start lifecycle.
    this.muted = muted;
  }

  constructor(private lang: string = (typeof navigator !== "undefined" && navigator.language) || "en-US") {}

  async start(cb: AsrCallbacks): Promise<void> {
    const Speech = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Speech) {
      cb.onError("Speech recognition is unavailable in this browser");
      throw new Error("web speech unavailable");
    }
    this.wants = true;
    const rec = new Speech();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.lang;
    rec.onresult = (event) => {
      if (this.muted) return; // push-to-talk released
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result?.isFinal) finalText += result[0].transcript;
        else interim += result?.[0].transcript ?? "";
      }
      if (interim.trim()) cb.onPartial(interim.trim());
      if (finalText.trim()) cb.onFinal(finalText.trim());
    };
    rec.onerror = (event) => {
      if (event.error && event.error !== "no-speech") cb.onError(event.error);
    };
    rec.onend = () => {
      // Chrome ends the session periodically; restart while the user wants it on.
      if (!this.wants) return;
      setTimeout(() => {
        try {
          rec.start();
        } catch {
          /* restart can race Chrome's internal state; the next onend retries */
        }
      }, 350);
    };
    this.rec = rec;
    rec.start();
  }

  stop(): void {
    this.wants = false;
    this.rec?.stop();
    this.rec = null;
  }
}

import type { SidebarState } from "../ws";
import { asrProviders, GEMMA_VAD_DEFAULTS, WHISPER_MODELS, type AsrProviderId } from "../asr";
import type { Capture } from "../useCapture";
import { CustomSelect } from "./CustomSelect";

/** Where each engine sends your audio — surfaced so participants can pick a private path. */
const PRIVACY: Record<AsrProviderId, { tone: "cloud" | "private"; note: string }> = {
  webspeech: { tone: "cloud", note: "Google" },
  elevenlabs: { tone: "cloud", note: "ElevenLabs" },
  "gemma-local": { tone: "private", note: "host GPU" },
  "whisper-webgpu": { tone: "private", note: "your GPU" },
};

const LANGS: { code: string; label: string }[] = [
  { code: "auto", label: "Auto" },
  { code: "en-US", label: "English" },
  { code: "pt-BR", label: "Português" },
  { code: "es-ES", label: "Español" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "it-IT", label: "Italiano" },
  { code: "ja-JP", label: "日本語" },
  { code: "zh-CN", label: "中文" },
];

/** The shared bottom bar — every participant's own mic controls (host and guests alike). */
export function ParticipantBar({ cap, state }: { cap: Capture; state: SidebarState }) {
  const providers = asrProviders();
  const self = state.presence.find((p) => p.id === state.selfId);
  const priv = PRIVACY[cap.engine];
  const usesVad = cap.engine === "gemma-local" || cap.engine === "whisper-webgpu"; // engines with the client energy VAD
  return (
    <footer className="micBar">
      <div className="micGroup">
        {self ? (
          <span className="micWho">
            <i style={{ background: self.color }} /> {self.name}
          </span>
        ) : null}
        <CustomSelect
          className="asrSelect"
          value={cap.engine}
          disabled={cap.speechOn}
          onChange={(val) => cap.setEngine(val as AsrProviderId)}
          ariaLabel="Speech-to-text engine"
          title="Speech-to-text engine"
          options={providers.map((p) => ({ value: p.id, label: p.label, disabled: !p.available }))}
          placement="top"
        />
        <CustomSelect
          className="asrSelect"
          value={cap.lang}
          disabled={cap.speechOn}
          onChange={cap.setLang}
          ariaLabel="Spoken language"
          title={cap.engine === "webspeech" ? "Web Speech can't auto-detect - set your spoken language" : "Spoken language (Auto = let the engine detect)"}
          options={LANGS.map((l) => ({ value: l.code, label: l.label }))}
          placement="top"
        />
        {cap.engine === "whisper-webgpu" ? (
          <CustomSelect
            className="asrSelect"
            value={cap.whisperModel}
            disabled={cap.speechOn}
            onChange={cap.setWhisperModel}
            ariaLabel="Whisper model"
            title="Bigger = more accurate (esp. multilingual), but a larger one-time download and a stronger GPU"
            options={WHISPER_MODELS.map((m) => ({ value: m.key, label: `${m.label} (${m.size})` }))}
            placement="top"
          />
        ) : null}
        <span className={"micPriv " + priv.tone} data-tip={priv.tone === "private" ? "audio stays on the host" : `audio goes to ${priv.note}`}>
          {priv.tone === "private" ? "● private" : "● cloud"} · {priv.note}
        </span>
        {usesVad ? (
          <button className={"capBtn" + (cap.showVad ? " on" : "")} onClick={() => cap.setShowVad(!cap.showVad)} data-tip="Noise floor + segmentation">
            Noise floor
          </button>
        ) : null}
      </div>

      <div className="micCenter">
        {!cap.speechOn ? (
          <button className="micJoin" onClick={() => void cap.start()}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-mic-icon lucide-mic"><path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/></svg> Join audio
          </button>
        ) : cap.mode === "ptt" ? (
          <button
            className={"micTalk" + (cap.talking ? " live" : "")}
            onPointerDown={(e) => {
              e.preventDefault();
              cap.pttDown();
            }}
            onPointerUp={() => cap.pttUp()}
            onPointerLeave={() => cap.pttUp()}
            data-tip="Hold to talk (or hold Space)"
          >
            {cap.talking ? "● talking…" : "Hold to talk"}
          </button>
        ) : (
          <span className="micLive on">&#9679; live</span>
        )}
        {cap.speechOn ? (
          <span className="micMeter" data-tip="Mic level">
            <span className="micMeterBar">
              <i style={{ width: Math.min(100, Math.round(cap.level * 320)) + "%" }} />
            </span>
          </span>
        ) : null}
        {cap.speechOn ? (
          <button className="capBtn stop" onClick={() => cap.stop()}>
            Leave audio
          </button>
        ) : null}
      </div>

      <div className="micGroup">
        <div className="micMode" role="group" aria-label="Mic mode">
          <button className={cap.mode === "open" ? "on" : ""} onClick={() => cap.setMode("open")} data-tip="Open mic (VAD)">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-speech-icon lucide-speech"><path d="M8.8 20v-4.1l1.9.2a2.3 2.3 0 0 0 2.164-2.1V8.3A5.37 5.37 0 0 0 2 8.25c0 2.8.656 3.054 1 4.55a5.77 5.77 0 0 1 .029 2.758L2 20"/><path d="M19.8 17.8a7.5 7.5 0 0 0 .003-10.603"/><path d="M17 15a3.5 3.5 0 0 0-.025-4.975"/></svg>
            Open mic
          </button>
          <button className={cap.mode === "ptt" ? "on" : ""} onClick={() => cap.setMode("ptt")} data-tip="Push-to-talk (hold Space)">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"><path d="m6.702 13.162l2.009 1.733V6.158c0-.916.737-1.658 1.647-1.658s1.647.742 1.647 1.658v4.473l2.812.453c1.815.274 2.723.41 3.362.796c1.056.637 1.821 1.593 1.821 2.99c0 .972-.239 1.624-.82 3.377c-.367 1.112-.552 1.668-.852 2.108a3.77 3.77 0 0 1-2.063 1.497c-.51.148-1.092.148-2.257.148h-.987c-1.549 0-2.323 0-3.012-.286a4 4 0 0 1-.362-.174c-.655-.358-1.143-.962-2.12-2.172l-3.16-3.916a1.656 1.656 0 0 1-.008-2.068a1.63 1.63 0 0 1 2.343-.222" /><path d="M14.316 6a4 4 0 0 0-8 0" /></g></svg>
            Push-to-talk
          </button>
        </div>
        {cap.status ? <span className="micStatus">{cap.status}</span> : null}
        {cap.error ? <span className="capError">{cap.error}</span> : null}
      </div>

      {usesVad && cap.showVad ? (
        <div className="vadPanel up">
          <div className="vadHead">
            <span>noise floor + segmentation</span>
            <button className="vadReset" onClick={() => cap.setVad({ ...GEMMA_VAD_DEFAULTS })}>
              reset
            </button>
          </div>
          <label className="vadRow">
            <span>noise floor</span>
            <input type="range" min={4} max={80} step={1} value={Math.round(cap.vad.startRms * 1000)} onChange={(e) => cap.setVad({ startRms: +e.target.value / 1000 })} />
            <b>{cap.vad.startRms.toFixed(3)}</b>
          </label>
          <div className={"vadCal" + (cap.level > cap.vad.startRms ? " hot" : "")}>
            mic now {cap.level.toFixed(3)} — {cap.level > cap.vad.startRms ? "▲ above floor (captures)" : "below floor (ignored)"}
          </div>
          <label className="vadRow">
            <span>finalize silence</span>
            <input type="range" min={150} max={1500} step={50} value={cap.vad.silenceMs} onChange={(e) => cap.setVad({ silenceMs: +e.target.value })} />
            <b>{cap.vad.silenceMs}ms</b>
          </label>
          <label className="vadRow">
            <span>max segment</span>
            <input type="range" min={2000} max={15000} step={500} value={cap.vad.maxUtterMs} onChange={(e) => cap.setVad({ maxUtterMs: +e.target.value })} />
            <b>{(cap.vad.maxUtterMs / 1000).toFixed(1)}s</b>
          </label>
          <div className="vadMetric">
            {cap.metric
              ? `last: ${(cap.metric.segmentMs / 1000).toFixed(1)}s seg · ${Math.round(cap.metric.transcribeMs)}ms · ~${((cap.vad.silenceMs + cap.metric.transcribeMs) / 1000).toFixed(1)}s to appear`
              : "speak to measure…"}
          </div>
        </div>
      ) : null}
    </footer>
  );
}

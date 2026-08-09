/**
 * Whisper model tiers for the on-device WebGPU engine. dtype is load-bearing: the
 * encoder is quantization-sensitive (keep fp16/fp32 — q4/q8 encoder = bad output),
 * the decoder MUST be q4 on WebGPU (q8 = gibberish, transformers.js#1317). Sizes are
 * one-time downloads from the HF CDN, cached in the browser afterwards.
 */
export interface WhisperModelMeta {
  key: string;
  id: string; // HF model id (transformers.js-compatible ONNX)
  label: string;
  size: string;
  dtype: { encoder_model: string; decoder_model_merged: string };
}

export const WHISPER_MODELS: WhisperModelMeta[] = [
  { key: "base", id: "onnx-community/whisper-base", label: "base · fast", size: "~200MB", dtype: { encoder_model: "fp32", decoder_model_merged: "q4" } },
  { key: "small", id: "onnx-community/whisper-small", label: "small · balanced", size: "~450MB", dtype: { encoder_model: "fp32", decoder_model_merged: "q4" } },
  { key: "large-v3-turbo", id: "onnx-community/whisper-large-v3-turbo", label: "large-v3-turbo · best", size: "~1.4GB", dtype: { encoder_model: "fp16", decoder_model_merged: "q4" } },
];

export const DEFAULT_WHISPER_MODEL = "base";

export function whisperModelMeta(key: string | undefined): WhisperModelMeta {
  return WHISPER_MODELS.find((m) => m.key === key) ?? WHISPER_MODELS[0]!;
}

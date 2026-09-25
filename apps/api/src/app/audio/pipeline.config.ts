export interface PipelineConfig {
  maxChunkDurationMs: number;
  minChunkDurationMs: number;
  silenceThresholdMs: number;
  sampleRate: number;
  sampleWidthBytes: number;
}

export const PIPELINE_CONFIG = Symbol('PIPELINE_CONFIG');

export function pipelineConfigFromEnv(
  env: Record<string, string | undefined>,
): PipelineConfig {
  return {
    maxChunkDurationMs: Number(env['MAX_CHUNK_DURATION_MS'] ?? 5000),
    minChunkDurationMs: Number(env['MIN_CHUNK_DURATION_MS'] ?? 800),
    silenceThresholdMs: Number(env['VAD_SILENCE_THRESHOLD_MS'] ?? 300),
    sampleRate: 16000,
    sampleWidthBytes: 2,
  };
}
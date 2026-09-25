import { IVadProcessor, VadSegment } from './vad.processor';

export class FakeVadProcessor implements IVadProcessor {
  segmentsPerRun: VadSegment[][] = [];

  constructor(private readonly segments: VadSegment[] = []) {}

  async run(_audio: Float32Array, _sampleRate: number): Promise<VadSegment[]> {
    return this.segments;
  }

  async dispose(): Promise<void> {
    return undefined;
  }
}

export function int16Samples(samples: number[]): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  samples.forEach((s, i) => view.setInt16(i * 2, s, true));
  return out;
}

export function silence(ms: number, sampleRate: number): Uint8Array {
  const samples = Math.floor((ms * sampleRate) / 1000);
  return new Uint8Array(samples * 2);
}

export const SAMPLE_RATE = 16000;

export function makeConfig(overrides: Partial<{ maxChunkDurationMs: number; silenceThresholdMs: number }> = {}) {
  return {
    maxChunkDurationMs: overrides.maxChunkDurationMs ?? 5000,
    silenceThresholdMs: overrides.silenceThresholdMs ?? 300,
    sampleRate: SAMPLE_RATE,
    sampleWidthBytes: 2,
  };
}
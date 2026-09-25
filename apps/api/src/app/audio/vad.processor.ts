export interface VadSegment {
  start: number;
  end: number;
}

export const VAD_PROCESSOR = Symbol('VAD_PROCESSOR');

export interface IVadProcessor {
  run(audio: Float32Array, sampleRate: number): Promise<VadSegment[]>;
  dispose(): Promise<void>;
}
export function int16ToFloat32(int16: Uint8Array): Float32Array {
  const n = Math.floor(int16.length / 2);
  const out = new Float32Array(n);
  const view = new DataView(int16.buffer, int16.byteOffset, int16.byteLength);
  for (let i = 0; i < n; i++) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

export function float32ToInt16(float32: Float32Array): Uint8Array {
  const out = new Uint8Array(float32.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < float32.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return out;
}

export function msToSamples(ms: number, sampleRate: number): number {
  return Math.floor((ms * sampleRate) / 1000);
}

export function samplesToMs(samples: number, sampleRate: number): number {
  return (samples / sampleRate) * 1000;
}
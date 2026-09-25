/**
 * Downsamples a multi-channel Float32 PCM buffer to mono by averaging channels.
 */
export function downmixToMono(
  channels: Float32Array[],
): Float32Array {
  if (channels.length === 0) {
    return new Float32Array(0);
  }
  const frames = channels[0].length;
  const mono = new Float32Array(frames);
  const count = channels.length;
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < count; c++) {
      sum += channels[c][i] ?? 0;
    }
    mono[i] = sum / count;
  }
  return mono;
}

/**
 * Converts a Float32 PCM buffer (range -1..1) to little-endian 16-bit PCM.
 */
export function float32ToInt16(float32: Float32Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(float32.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < float32.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return out;
}

export const PCM_MIME_TYPE = 'audio/pcm';
export const MIC_SAMPLE_RATE = 16000;
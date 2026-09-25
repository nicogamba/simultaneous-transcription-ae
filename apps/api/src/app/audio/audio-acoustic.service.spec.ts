import { execFileSync } from 'node:child_process';
import { AudioAcousticService } from './audio-acoustic.service';

function ffmpegAvailable(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function generateWav(durationMs: number, sampleRate: number, frequency: number): Buffer {
  const samples = Math.floor((durationMs * sampleRate) / 1000);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i++) {
    const sample = Math.round(Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 8000);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }
  return buffer;
}

describe('AudioAcousticService', () => {
  const service = new AudioAcousticService();
  const canRun = ffmpegAvailable();

  it('converts 44.1kHz WAV to 16kHz mono PCM', async () => {
    if (!canRun) {
      return;
    }
    const wav = generateWav(200, 44100, 440);
    const pcm = await service.transcodeToPcm16kMono(new Uint8Array(wav), 'audio/wav');

    const expectedSamples = 3200;
    expect(pcm.byteLength).toBeGreaterThanOrEqual(expectedSamples * 2);
    expect(pcm.byteLength % 2).toBe(0);

    const durationMs = (pcm.byteLength / 2 / 16000) * 1000;
    expect(durationMs).toBeCloseTo(200, 0);
  });

  it('returns empty PCM for empty input', async () => {
    const pcm = await service.transcodeToPcm16kMono(new Uint8Array(0), 'audio/wav');
    expect(pcm.byteLength).toBe(0);
  });

  it('rejects invalid audio', async () => {
    if (!canRun) {
      return;
    }
    const garbage = new Uint8Array(1024).fill(0x7f);
    await expect(
      service.transcodeToPcm16kMono(garbage, 'audio/wav'),
    ).rejects.toBeDefined();
  });
});
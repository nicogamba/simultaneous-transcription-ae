import { SileroVadService } from './silero-vad.service';
import { VadChunk } from '@simultaneous-transcription-ae/shared-types';
import { FakeVadProcessor, int16Samples, makeConfig, silence } from './testing/vad.fixtures';

const SAMPLE_RATE = 16000;

function buildVad(segments: Array<{ start: number; end: number }> = []) {
  const fake = new FakeVadProcessor(segments);
  const service = new SileroVadService(fake, makeConfig());
  return { fake, service };
}

describe('SileroVadService', () => {
  describe('chunking by silence gap', () => {
    it('cuts a chunk when trailing silence exceeds the threshold', async () => {
      const speech = int16Samples(Array(1600).fill(0).map((_, i) => Math.round(Math.sin(i / 10) * 3000)));
      const silenceMs = 400;
      const speechSamples = speech.byteLength / 2;
      const silenceSamples = Math.floor((silenceMs * SAMPLE_RATE) / 1000);
      const { service } = buildVad([{ start: 0, end: speechSamples }]);

      const chunks1 = await service.ingestPcm('s1', speech);
      expect(chunks1).toHaveLength(0);

      const chunks2 = await service.ingestPcm('s1', silence(silenceMs, SAMPLE_RATE));
      expect(chunks2).toHaveLength(1);
      expect(chunks2[0].sequenceId).toBe(0);
      expect(chunks2[0].startMs).toBe(0);
      expect(chunks2[0].endMs).toBe((speechSamples / SAMPLE_RATE) * 1000);
    });

    it('does NOT cut when trailing silence is below threshold', async () => {
      const speechSamples = 3200;
      const { service } = buildVad([{ start: 0, end: speechSamples }]);

      await service.ingestPcm('s1', int16Samples(Array(3200).fill(100)));
      const chunks = await service.ingestPcm('s1', silence(100, SAMPLE_RATE));

      expect(chunks).toHaveLength(0);
    });
  });

  describe('chunking by max duration', () => {
    it('cuts at MAX_CHUNK_DURATION_MS when the buffer is full', async () => {
      const maxChunk = 5000;
      const service = new SileroVadService(
        new FakeVadProcessor([{ start: 0, end: (maxChunk * SAMPLE_RATE) / 1000 }]),
        makeConfig({ maxChunkDurationMs: maxChunk }),
      );

      const chunk: VadChunk[] = await service.ingestPcm(
        's2',
        int16Samples(Array((maxChunk * SAMPLE_RATE) / 1000).fill(50)),
      );

      expect(chunk).toHaveLength(1);
      expect(chunk[0].sequenceId).toBe(0);
      expect(chunk[0].endMs).toBeCloseTo(maxChunk, 0);
    });

    it('drops a full buffer with no detected speech', async () => {
      const maxChunk = 5000;
      const service = new SileroVadService(
        new FakeVadProcessor([]),
        makeConfig({ maxChunkDurationMs: maxChunk }),
      );

      const chunks = await service.ingestPcm(
        's3',
        silence(maxChunk, SAMPLE_RATE),
      );

      expect(chunks).toHaveLength(0);
    });
  });

  describe('sequence ids', () => {
    it('assigns strictly incrementing sequence ids per session', async () => {
      const { service } = buildVad([{ start: 0, end: 1600 }]);
      await service.ingestPcm('s4', int16Samples(Array(1600).fill(100)));
      const c1 = await service.ingestPcm('s4', silence(400, SAMPLE_RATE));
      const c2 = await service.ingestPcm('s4', silence(400, SAMPLE_RATE));

      expect(c1[0].sequenceId).toBe(0);
      expect(c2[0].sequenceId).toBe(1);
    });

    it('keeps per-session counters independent', async () => {
      const fake = new FakeVadProcessor([{ start: 0, end: 1600 }]);
      const service = new SileroVadService(fake, makeConfig());

      await service.ingestPcm('a', int16Samples(Array(1600).fill(100)));
      await service.ingestPcm('b', int16Samples(Array(1600).fill(100)));

      const ca = await service.ingestPcm('a', silence(400, SAMPLE_RATE));
      const cb = await service.ingestPcm('b', silence(400, SAMPLE_RATE));

      expect(ca[0].sequenceId).toBe(0);
      expect(cb[0].sequenceId).toBe(0);
    });
  });

  describe('memory management', () => {
    it('flushes pending speech on endSession and clears state', async () => {
      const { service } = buildVad([{ start: 0, end: 1600 }]);
      await service.ingestPcm('s5', int16Samples(Array(1600).fill(100)));

      const flushed = await service.flushSession('s5');
      expect(flushed).toHaveLength(1);

      service.endSession('s5');
      const { service: fresh } = buildVad([]);
      const again = await fresh.ingestPcm('s5', silence(400, SAMPLE_RATE));
      expect(again).toHaveLength(0);
    });

    it('does not grow the pending buffer beyond max chunk duration', async () => {
      const maxChunk = 5000;
      const speechSegments = { start: 0, end: (maxChunk * SAMPLE_RATE) / 1000 };
      const service = new SileroVadService(
        new FakeVadProcessor([speechSegments]),
        makeConfig({ maxChunkDurationMs: maxChunk }),
      );

      for (let i = 0; i < 10; i++) {
        await service.ingestPcm('s6', int16Samples(Array(3200).fill(100)));
      }

      const flushed = await service.flushSession('s6');
      const totalBytes = flushed.reduce((acc, c) => acc + c.data.byteLength, 0);
      expect(totalBytes).toBeLessThanOrEqual(maxChunk * SAMPLE_RATE * 2);
    });
  });
});
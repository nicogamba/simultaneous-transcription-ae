import { SileroVadService } from './silero-vad.service';
import { VadChunk } from '@simultaneous-transcription-ae/shared-types';
import { FakeVadProcessor, int16Samples, makeConfig, silence } from './testing/vad.fixtures';

const SAMPLE_RATE = 16000;

function speechMs(ms: number): Uint8Array {
  const samples = Math.floor((ms * SAMPLE_RATE) / 1000);
  return int16Samples(
    Array(samples)
      .fill(0)
      .map((_, i) => Math.round(Math.sin(i / 10) * 3000)),
  );
}

function buildVad(
  segments: Array<{ start: number; end: number }> = [],
  config = makeConfig(),
) {
  const fake = new FakeVadProcessor(segments);
  const service = new SileroVadService(fake, config);
  return { fake, service };
}

describe('SileroVadService', () => {
  describe('chunking by silence gap', () => {
    it('cuts a chunk when trailing silence exceeds the threshold and the utterance meets the min duration', async () => {
      const speech = speechMs(1000);
      const speechSamples = speech.byteLength / 2;
      const { service } = buildVad([{ start: 0, end: speechSamples }]);

      const chunks1 = await service.ingestPcm('s1', speech);
      expect(chunks1).toHaveLength(0);

      const chunks2 = await service.ingestPcm('s1', silence(400, SAMPLE_RATE));
      expect(chunks2).toHaveLength(1);
      expect(chunks2[0].sequenceId).toBe(0);
      expect(chunks2[0].startMs).toBe(0);
      expect(chunks2[0].endMs).toBe((speechSamples / SAMPLE_RATE) * 1000);
    });

    it('does NOT cut a short utterance below the min chunk duration even with trailing silence', async () => {
      const speech = speechMs(400);
      const speechSamples = speech.byteLength / 2;
      const { service } = buildVad([{ start: 0, end: speechSamples }]);

      await service.ingestPcm('s1', speech);
      const chunks = await service.ingestPcm('s1', silence(400, SAMPLE_RATE));

      expect(chunks).toHaveLength(0);
    });

    it('does NOT cut when trailing silence is below threshold', async () => {
      const speechSamples = 16000;
      const { service } = buildVad([{ start: 0, end: speechSamples }]);

      await service.ingestPcm('s1', speechMs(1000));
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

    it('does not emit micro-chunks below the min duration at the max-chunk boundary', async () => {
      const maxChunk = 2000;
      const shortSpeechSamples = 6400; // 400ms < minChunk (800ms)
      const service = new SileroVadService(
        new FakeVadProcessor([{ start: 0, end: shortSpeechSamples }]),
        makeConfig({ maxChunkDurationMs: maxChunk }),
      );

      await service.ingestPcm('s7', speechMs(400));
      const chunks = await service.ingestPcm(
        's7',
        silence(maxChunk - 400, SAMPLE_RATE),
      );

      expect(chunks).toHaveLength(1);
      expect(chunks[0].data.byteLength).toBe(
        (maxChunk * SAMPLE_RATE * 2) / 1000,
      );
    });
  });

  describe('sequence ids', () => {
    it('assigns strictly incrementing sequence ids per session', async () => {
      const maxChunk = 2000;
      const service = new SileroVadService(
        new FakeVadProcessor([
          { start: 0, end: (maxChunk * SAMPLE_RATE) / 1000 },
        ]),
        makeConfig({ maxChunkDurationMs: maxChunk }),
      );

      const c1 = await service.ingestPcm('s4', speechMs(maxChunk));
      const c2 = await service.ingestPcm('s4', speechMs(maxChunk));

      expect(c1).toHaveLength(1);
      expect(c2).toHaveLength(1);
      expect(c1[0].sequenceId).toBe(0);
      expect(c2[0].sequenceId).toBe(1);
    });

    it('keeps per-session counters independent', async () => {
      const maxChunk = 2000;
      const service = new SileroVadService(
        new FakeVadProcessor([
          { start: 0, end: (maxChunk * SAMPLE_RATE) / 1000 },
        ]),
        makeConfig({ maxChunkDurationMs: maxChunk }),
      );

      const ca = await service.ingestPcm('a', speechMs(maxChunk));
      const cb = await service.ingestPcm('b', speechMs(maxChunk));

      expect(ca[0].sequenceId).toBe(0);
      expect(cb[0].sequenceId).toBe(0);
    });
  });

  describe('memory management', () => {
    it('flushes pending speech on endSession and clears state', async () => {
      const { service } = buildVad([{ start: 0, end: 16000 }]);
      await service.ingestPcm('s5', speechMs(1000));

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
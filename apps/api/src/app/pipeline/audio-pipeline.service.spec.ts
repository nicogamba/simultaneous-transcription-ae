import {
  CreateSessionDto,
  SessionStatus,
  SourceLanguage,
  TargetLanguage,
  VadChunk,
} from '@simultaneous-transcription-ae/shared-types';
import { MockTranslationProvider } from '../ai/translation/mock-translation.provider';
import { TranscriptionEngine } from '../ai/transcription-engine.service';
import { FakeBroadcaster } from '../broadcast/testing/broadcaster.fixtures';
import {
  AudioPipelineService,
  SessionAlreadyExistsError,
  SessionNotFoundError,
} from './audio-pipeline.service';

const SAMPLE_RATE = 16000;

function pcm(ms: number, sample = 100): Uint8Array {
  const samples = Math.floor((ms * SAMPLE_RATE) / 1000);
  const out = new Uint8Array(samples * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples; i++) {
    view.setInt16(i * 2, sample, true);
  }
  return out;
}

class FakeAcoustic {
  async transcodeToPcm16kMono(data: Uint8Array): Promise<Uint8Array> {
    return data;
  }
}

class FakeVad {
  private counters = new Map<string, number>();

  async ingestPcm(sessionId: string, data: Uint8Array): Promise<VadChunk[]> {
    const id = this.counters.get(sessionId) ?? 0;
    this.counters.set(sessionId, id + 1);
    return [
      {
        sessionId,
        sequenceId: id,
        data,
        startMs: id * 100,
        endMs: id * 100 + 100,
      },
    ];
  }

  async flushSession(): Promise<VadChunk[]> {
    return [];
  }

  endSession(sessionId: string): void {
    this.counters.delete(sessionId);
  }
}

function makePipeline() {
  const broadcaster = new FakeBroadcaster();
  const vad = new FakeVad();
  const engine = new TranscriptionEngine(
    new MockTranslationProvider(),
    broadcaster,
  );
  const pipeline = new AudioPipelineService(
    new FakeAcoustic() as never,
    vad as never,
    engine,
    broadcaster,
  );
  return { pipeline, broadcaster, vad };
}

function makeSession(overrides: Partial<CreateSessionDto> = {}): CreateSessionDto {
  return {
    id: 'stage-1',
    sourceLanguage: SourceLanguage.EN,
    targetLanguage: TargetLanguage.ES,
    ...overrides,
  };
}

describe('AudioPipelineService', () => {
  it('ingests audio and broadcasts a transcription with sequence id', async () => {
    const { pipeline, broadcaster } = makePipeline();
    pipeline.registerSession(makeSession());

    await pipeline.ingest('stage-1', pcm(100), 'audio/wav');

    expect(broadcaster.transcriptions).toHaveLength(1);
    const result = broadcaster.transcriptions[0];
    expect(result.sessionId).toBe('stage-1');
    expect(result.sequenceId).toBe(0);
    expect(result.sourceLanguage).toBe(SourceLanguage.EN);
    expect(result.targetLanguage).toBe(TargetLanguage.ES);
    expect(result.sourceText).toContain('mock:0');
  });

  it('supports multiple concurrent sessions independently', async () => {
    const { pipeline, broadcaster } = makePipeline();
    pipeline.registerSession(makeSession({ id: 'stage-1' }));
    pipeline.registerSession(makeSession({ id: 'stage-2' }));

    await Promise.all([
      pipeline.ingest('stage-1', pcm(100), 'audio/wav'),
      pipeline.ingest('stage-2', pcm(100), 'audio/wav'),
    ]);

    expect(pipeline.sessionCount()).toBe(2);
    const sessionIds = broadcaster.transcriptions.map((r) => r.sessionId).sort();
    expect(sessionIds).toEqual(['stage-1', 'stage-2']);
  });

  it('keeps strictly incrementing sequence ids under concurrent ingests', async () => {
    const { pipeline, broadcaster } = makePipeline();
    pipeline.registerSession(makeSession({ id: 'stage-1' }));

    await Promise.all([
      pipeline.ingest('stage-1', pcm(100), 'audio/wav'),
      pipeline.ingest('stage-1', pcm(100), 'audio/wav'),
      pipeline.ingest('stage-1', pcm(100), 'audio/wav'),
    ]);

    const ids = broadcaster.transcriptions.map((r) => r.sequenceId).sort();
    expect(ids).toEqual([0, 1, 2]);
  });

  it('rejects duplicate session registration', () => {
    const { pipeline } = makePipeline();
    pipeline.registerSession(makeSession());
    expect(() => pipeline.registerSession(makeSession())).toThrow(
      SessionAlreadyExistsError,
    );
  });

  it('rejects ingest for unknown session', async () => {
    const { pipeline } = makePipeline();
    await expect(
      pipeline.ingest('nope', pcm(100), 'audio/wav'),
    ).rejects.toThrow(SessionNotFoundError);
  });

  it('ends a session, broadcasts status and frees memory', async () => {
    const { pipeline, broadcaster } = makePipeline();
    pipeline.registerSession(makeSession({ id: 'stage-1' }));

    await pipeline.ingest('stage-1', pcm(100), 'audio/wav');
    await pipeline.endSession('stage-1');

    expect(pipeline.sessionCount()).toBe(0);
    expect(broadcaster.statuses).toContainEqual({
      sessionId: 'stage-1',
      status: SessionStatus.ENDED,
    });
  });

  it('gracefully shuts down all sessions on module destroy', async () => {
    const { pipeline, broadcaster } = makePipeline();
    pipeline.registerSession(makeSession({ id: 'stage-1' }));
    pipeline.registerSession(makeSession({ id: 'stage-2' }));

    await pipeline.onModuleDestroy();

    expect(pipeline.sessionCount()).toBe(0);
    expect(
      broadcaster.statuses.filter((s) => s.status === SessionStatus.ENDED),
    ).toHaveLength(2);
  });
});
import { SubtitleStore } from './subtitle-store.service';
import {
  SessionStatus,
  SourceLanguage,
  TargetLanguage,
  TranscriptionPayload,
  TranscriptionResult,
} from '@simultaneous-transcription-ae/shared-types';

function payload(result: TranscriptionResult): TranscriptionPayload {
  return {
    sessionId: result.sessionId,
    event: 'transcription',
    sequenceId: result.sequenceId,
    result,
    status: null,
    error: null,
    serverTimestamp: Date.now(),
  };
}

function result(sequenceId: number): TranscriptionResult {
  return {
    sessionId: 's1',
    sequenceId,
    sourceLanguage: SourceLanguage.EN,
    targetLanguage: TargetLanguage.ES,
    sourceText: `text-${sequenceId}`,
    translatedText: `trad-${sequenceId}`,
    startMs: sequenceId * 100,
    endMs: sequenceId * 100 + 100,
    createdAt: Date.now(),
  };
}

describe('SubtitleStore', () => {
  it('orders subtitles by sequenceId via the jitter buffer', () => {
    const store = new SubtitleStore();

    store.handle(payload(result(2)));
    store.handle(payload(result(0)));
    store.handle(payload(result(1)));

    expect(store.subtitleHistory().map((r) => r.sequenceId)).toEqual([0, 1, 2]);
  });

  it('tracks session status and errors', () => {
    const store = new SubtitleStore();

    store.handle({
      sessionId: 's1',
      event: 'status',
      sequenceId: null,
      result: null,
      status: SessionStatus.ACTIVE,
      error: null,
      serverTimestamp: Date.now(),
    });
    expect(store.status()).toBe(SessionStatus.ACTIVE);

    store.handle({
      sessionId: 's1',
      event: 'error',
      sequenceId: null,
      result: null,
      status: null,
      error: 'boom',
      serverTimestamp: Date.now(),
    });
    expect(store.error()).toBe('boom');
  });

  it('only exposes the last two visible subtitles', () => {
    const store = new SubtitleStore();
    for (let i = 0; i < 5; i++) {
      store.handle(payload(result(i)));
    }

    expect(store.visibleSubtitles().map((r) => r.sequenceId)).toEqual([3, 4]);
  });

  it('resets state', () => {
    const store = new SubtitleStore();
    store.handle(payload(result(0)));
    store.reset('s2');

    expect(store.subtitleHistory()).toHaveLength(0);
    expect(store.status()).toBeNull();
    expect(store.error()).toBeNull();
  });
});
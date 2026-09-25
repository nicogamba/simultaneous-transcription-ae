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

  it('only exposes the last four visible subtitles in order', () => {
    const store = new SubtitleStore();
    for (let i = 0; i < 7; i++) {
      store.handle(payload(result(i)));
    }

    expect(store.visibleSubtitles().map((r) => r.sequenceId)).toEqual([
      3, 4, 5, 6,
    ]);
  });

  it('shows source text in original mode', () => {
    const store = new SubtitleStore();
    store.handle(payload(result(0)));
    store.setDisplayMode('original');

    expect(store.visibleTexts()[0].text).toBe('text-0');
  });

  it('shows translated text (fallback to source) in translation mode', () => {
    const store = new SubtitleStore();
    store.handle(payload(result(0)));
    store.setDisplayMode('translation');

    expect(store.visibleTexts()[0].text).toBe('trad-0');
  });

  it('falls back to source text when no translation exists', () => {
    const store = new SubtitleStore();
    const withoutTranslation: TranscriptionResult = {
      ...result(0),
      translatedText: null,
    };
    store.handle(payload(withoutTranslation));
    store.setDisplayMode('translation');

    expect(store.visibleTexts()[0].text).toBe('text-0');
  });

  it('exposes current source/target languages from the latest result', () => {
    const store = new SubtitleStore();
    expect(store.currentLanguages().source).toBeNull();

    store.handle(payload(result(0)));
    expect(store.currentLanguages()).toEqual({
      source: SourceLanguage.EN,
      target: TargetLanguage.ES,
    });
  });

  it('resets state', () => {
    const store = new SubtitleStore();
    store.handle(payload(result(0)));
    store.reset('s2');

    expect(store.subtitleHistory()).toHaveLength(0);
    expect(store.status()).toBeNull();
    expect(store.error()).toBeNull();
    expect(store.displayMode()).toBe('translation');
  });
});
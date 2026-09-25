import { JitterBuffer } from './jitter-buffer.service';
import { SourceLanguage, TargetLanguage, TranscriptionResult } from '@simultaneous-transcription-ae/shared-types';

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

describe('JitterBuffer', () => {
  it('emits results in sequenceId order even when pushed out of order', () => {
    const received: TranscriptionResult[] = [];
    const buffer = new JitterBuffer();
    buffer.setHandler((r) => received.push(r));

    buffer.push(result(2));
    expect(received).toHaveLength(0);

    buffer.push(result(0));
    expect(received.map((r) => r.sequenceId)).toEqual([0]);

    buffer.push(result(1));
    expect(received.map((r) => r.sequenceId)).toEqual([0, 1, 2]);
  });

  it('drops duplicate or late results', () => {
    const received: TranscriptionResult[] = [];
    const buffer = new JitterBuffer();
    buffer.setHandler((r) => received.push(r));

    buffer.push(result(0));
    buffer.push(result(1));
    buffer.push(result(0));
    buffer.push(result(1));

    expect(received.map((r) => r.sequenceId)).toEqual([0, 1]);
  });

  it('handles a gap and fills it when the missing item arrives', () => {
    const received: TranscriptionResult[] = [];
    const buffer = new JitterBuffer();
    buffer.setHandler((r) => received.push(r));

    buffer.push(result(2));
    buffer.push(result(3));
    expect(received).toHaveLength(0);

    buffer.push(result(1));
    expect(received).toHaveLength(0);

    buffer.push(result(0));
    expect(received.map((r) => r.sequenceId)).toEqual([0, 1, 2, 3]);
  });

  it('resets its internal state', () => {
    const received: TranscriptionResult[] = [];
    const buffer = new JitterBuffer();
    buffer.setHandler((r) => received.push(r));

    buffer.push(result(0));
    buffer.reset();
    buffer.push(result(0));

    expect(received.map((r) => r.sequenceId)).toEqual([0, 0]);
  });
});
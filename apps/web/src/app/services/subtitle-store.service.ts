import { Injectable, signal, computed } from '@angular/core';
import {
  SessionStatus,
  SourceLanguage,
  TargetLanguage,
  TranscriptionPayload,
  TranscriptionResult,
} from '@simultaneous-transcription-ae/shared-types';
import { JitterBuffer } from './jitter-buffer.service';

export const MAX_VISIBLE_SUBTITLES = 4;

export type DisplayMode = 'original' | 'translation';

export interface VisibleSubtitle {
  sequenceId: number;
  text: string;
}

@Injectable({ providedIn: 'root' })
export class SubtitleStore {
  readonly status = signal<SessionStatus | null>(null);
  readonly error = signal<string | null>(null);
  readonly subtitleHistory = signal<TranscriptionResult[]>([]);
  readonly displayMode = signal<DisplayMode>('translation');

  readonly visibleSubtitles = computed(() =>
    this.subtitleHistory().slice(-MAX_VISIBLE_SUBTITLES),
  );

  readonly visibleTexts = computed<VisibleSubtitle[]>(() => {
    const mode = this.displayMode();
    return this.visibleSubtitles().map((result) => ({
      sequenceId: result.sequenceId,
      text:
        mode === 'original'
          ? result.sourceText
          : (result.translatedText ?? result.sourceText),
    }));
  });

  readonly currentLanguages = computed<{
    source: SourceLanguage | null;
    target: TargetLanguage | null;
  }>(() => {
    const last = this.subtitleHistory()[this.subtitleHistory().length - 1];
    return last
      ? { source: last.sourceLanguage, target: last.targetLanguage }
      : { source: null, target: null };
  });

  private readonly jitter: JitterBuffer;

  constructor() {
    this.jitter = new JitterBuffer();
    this.jitter.setHandler((result) => {
      this.subtitleHistory.update((history) => [...history, result]);
    });
  }

  handle(payload: TranscriptionPayload): void {
    switch (payload.event) {
      case 'transcription':
        if (payload.result) {
          this.jitter.push(payload.result);
        }
        break;
      case 'status':
        this.status.set(payload.status);
        break;
      case 'error':
        this.error.set(payload.error);
        break;
      default:
        break;
    }
  }

  setDisplayMode(mode: DisplayMode): void {
    this.displayMode.set(mode);
  }

  reset(_sessionId?: string): void {
    this.jitter.reset();
    this.subtitleHistory.set([]);
    this.status.set(null);
    this.error.set(null);
    this.displayMode.set('translation');
  }
}
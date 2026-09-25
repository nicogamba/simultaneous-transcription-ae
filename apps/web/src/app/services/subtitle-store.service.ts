import { Injectable, signal, computed } from '@angular/core';
import {
  SessionStatus,
  TranscriptionPayload,
  TranscriptionResult,
} from '@simultaneous-transcription-ae/shared-types';
import { JitterBuffer } from './jitter-buffer.service';

export const MAX_VISIBLE_SUBTITLES = 2;

@Injectable({ providedIn: 'root' })
export class SubtitleStore {
  readonly status = signal<SessionStatus | null>(null);
  readonly error = signal<string | null>(null);
  readonly subtitleHistory = signal<TranscriptionResult[]>([]);
  readonly visibleSubtitles = computed(() =>
    this.subtitleHistory().slice(-MAX_VISIBLE_SUBTITLES),
  );

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

  reset(sessionId?: string): void {
    this.jitter.reset();
    this.subtitleHistory.set([]);
    this.status.set(null);
    this.error.set(null);
  }
}
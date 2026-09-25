import { Injectable, OnDestroy, signal } from '@angular/core';
import { TranscriptionPayload } from '@simultaneous-transcription-ae/shared-types';
import { SubtitleStore } from './subtitle-store.service';

export type SseConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

const RECONNECT_DELAYS_MS = [1000, 2000, 4000];

@Injectable({ providedIn: 'root' })
export class SseService implements OnDestroy {
  readonly status = signal<SseConnectionStatus>('idle');

  private source: EventSource | null = null;
  private sessionId: string | null = null;
  private shouldReconnect = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly store: SubtitleStore) {}

  connect(sessionId: string): void {
    this.disconnect();
    this.sessionId = sessionId;
    this.shouldReconnect = true;
    this.reconnectAttempt = 0;
    this.store.reset(sessionId);
    this.open();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.source) {
      this.source.close();
      this.source = null;
    }
    this.sessionId = null;
    this.status.set('idle');
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  private open(): void {
    if (!this.sessionId) {
      return;
    }
    this.source = new EventSource(`/api/stage/${this.sessionId}/subtitles`);
    this.status.set(
      this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting',
    );

    this.source.onopen = () => {
      this.reconnectAttempt = 0;
      this.status.set('connected');
    };

    this.source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string) as TranscriptionPayload;
        this.store.handle(payload);
      } catch {
        this.store.error.set('Invalid payload received');
      }
    };

    this.source.onerror = () => {
      this.source?.close();
      this.source = null;
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      } else {
        this.status.set('error');
      }
    };
  }

  private scheduleReconnect(): void {
    const delay =
      RECONNECT_DELAYS_MS[
        Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)
      ];
    this.reconnectAttempt += 1;
    this.status.set('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }
}
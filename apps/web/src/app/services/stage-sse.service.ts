import { Injectable, OnDestroy } from '@angular/core';
import { SubtitleStore } from './subtitle-store.service';

@Injectable({ providedIn: 'root' })
export class StageSseService implements OnDestroy {
  private source: EventSource | null = null;

  constructor(private readonly store: SubtitleStore) {}

  connect(sessionId: string): void {
    this.disconnect();
    this.store.reset(sessionId);
    this.source = new EventSource(`/api/stage/${sessionId}/subtitles`);
    this.source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string) as Parameters<
          SubtitleStore['handle']
        >[0];
        this.store.handle(payload);
      } catch {
        this.store.error.set('Invalid payload received');
      }
    };
    this.source.onerror = () => {
      this.store.error.set('SSE connection lost');
    };
  }

  disconnect(): void {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
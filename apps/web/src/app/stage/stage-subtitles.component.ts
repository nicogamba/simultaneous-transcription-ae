import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SseService } from '../services/sse.service';
import { SubtitleStore, DisplayMode } from '../services/subtitle-store.service';

@Component({
  selector: 'app-stage-subtitles',
  imports: [CommonModule],
  templateUrl: './stage-subtitles.component.html',
  styleUrl: './stage-subtitles.component.scss',
})
export class StageSubtitlesComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  protected readonly sse = inject(SseService);
  protected readonly store = inject(SubtitleStore);
  protected readonly sessionId = signal<string>('');

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.sessionId.set(id);
    this.sse.connect(id);
  }

  ngOnDestroy(): void {
    this.sse.disconnect();
  }

  protected isActive(mode: DisplayMode): boolean {
    return this.store.displayMode() === mode;
  }

  protected selectMode(mode: DisplayMode): void {
    this.store.setDisplayMode(mode);
  }

  protected sourceLabel(): string {
    const source = this.store.currentLanguages().source;
    return source ? `Original (${source.toUpperCase()})` : 'Original';
  }

  protected translationLabel(): string {
    const target = this.store.currentLanguages().target;
    if (!target) {
      return 'Traducción';
    }
    return target === 'es' ? 'Español (ES)' : `Traducción (${target.toUpperCase()})`;
  }
}
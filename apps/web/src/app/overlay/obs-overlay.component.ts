import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SseService } from '../services/sse.service';
import { SubtitleStore } from '../services/subtitle-store.service';

@Component({
  selector: 'app-obs-overlay',
  imports: [],
  templateUrl: './obs-overlay.component.html',
  styleUrl: './obs-overlay.component.scss',
})
export class ObsOverlayComponent implements OnInit, OnDestroy {
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
}
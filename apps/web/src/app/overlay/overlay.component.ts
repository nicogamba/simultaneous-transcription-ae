import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { StageSseService } from '../services/stage-sse.service';
import { SubtitleStore } from '../services/subtitle-store.service';

@Component({
  selector: 'app-overlay',
  imports: [],
  templateUrl: './overlay.component.html',
  styleUrl: './overlay.component.scss',
})
export class OverlayComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly sse = inject(StageSseService);
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
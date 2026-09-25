import { Injectable } from '@angular/core';
import { TranscriptionResult } from '@simultaneous-transcription-ae/shared-types';

const MAX_BUFFER_SIZE = 200;

@Injectable()
export class JitterBuffer {
  private readonly pending = new Map<number, TranscriptionResult>();
  private nextSequenceId = 0;
  private handler: ((result: TranscriptionResult) => void) | null = null;

  setHandler(handler: (result: TranscriptionResult) => void): void {
    this.handler = handler;
  }

  push(result: TranscriptionResult): void {
    const sequenceId = result.sequenceId;
    if (sequenceId < this.nextSequenceId) {
      return;
    }
    this.pending.set(sequenceId, result);
    this.trim();
    this.drain();
  }

  reset(): void {
    this.pending.clear();
    this.nextSequenceId = 0;
  }

  private drain(): void {
    while (this.pending.has(this.nextSequenceId)) {
      const result = this.pending.get(this.nextSequenceId);
      this.pending.delete(this.nextSequenceId);
      this.nextSequenceId += 1;
      if (result && this.handler) {
        this.handler(result);
      }
    }
  }

  private trim(): void {
    while (this.pending.size > MAX_BUFFER_SIZE) {
      const earliest = Math.min(...this.pending.keys());
      this.pending.delete(earliest);
    }
  }
}
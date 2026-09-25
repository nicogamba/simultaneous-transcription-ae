import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { SourceLanguage, TargetLanguage } from '@simultaneous-transcription-ae/shared-types';

export interface IngestOptions {
  sessionId: string;
  sourceLanguage: SourceLanguage;
  targetLanguage: TargetLanguage;
  mimeType: string;
}

@Injectable({ providedIn: 'root' })
export class IngestionService {
  readonly connected = signal(false);
  readonly sessionId = signal<string | null>(null);

  private socket: Socket | null = null;

  connect(options: IngestOptions): void {
    this.disconnect();
    this.sessionId.set(options.sessionId);
    this.socket = io({
      path: '/ingest',
      query: {
        sessionId: options.sessionId,
        sourceLang: options.sourceLanguage,
        targetLang: options.targetLanguage,
        mimeType: options.mimeType,
      },
      transports: ['websocket'],
    });
    this.socket.on('connect', () => this.connected.set(true));
    this.socket.on('disconnect', () => this.connected.set(false));
    this.socket.on('connect_error', () => this.connected.set(false));
  }

  sendAudio(data: string, mimeType: string): Promise<void> {
    return this.emitWithAck('audio', {
      sessionId: this.sessionId(),
      mimeType,
      data,
      clientTimestamp: Date.now(),
    });
  }

  sendEnd(): Promise<void> {
    return this.emitWithAck('end');
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected.set(false);
    this.sessionId.set(null);
  }

  private emitWithAck(event: string, payload?: unknown): Promise<void> {
    const socket = this.socket;
    if (!socket) {
      return Promise.reject(new Error('Socket is not connected'));
    }
    return new Promise((resolve, reject) => {
      socket.emit(event, payload, (response: unknown) => {
        const ack = response as { ok?: boolean };
        if (ack && ack.ok === true) {
          resolve();
        } else {
          reject(new Error(`ack failed for '${event}': ${JSON.stringify(response)}`));
        }
      });
    });
  }
}
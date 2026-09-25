import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import {
  AudioChunkDto,
  SourceLanguage,
  TargetLanguage,
} from '@simultaneous-transcription-ae/shared-types';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface WsConnectOptions {
  sessionId: string;
  sourceLanguage: SourceLanguage;
  targetLanguage: TargetLanguage;
  mimeType: string;
}

export interface WsAck {
  ok: boolean;
}

@Injectable({ providedIn: 'root' })
export class WsService {
  readonly status = signal<ConnectionStatus>('disconnected');
  readonly sessionId = signal<string | null>(null);

  private socket: Socket | null = null;

  connect(options: WsConnectOptions): void {
    this.disconnect();
    this.sessionId.set(options.sessionId);
    this.status.set('connecting');

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

    this.socket.on('connect', () => this.status.set('connected'));
    this.socket.on('disconnect', () => this.status.set('disconnected'));
    this.socket.on('connect_error', () => this.status.set('error'));
  }

  sendAudio(chunk: Omit<AudioChunkDto, 'sessionId'>): Promise<WsAck> {
    return this.emitWithAck('audio', {
      sessionId: this.sessionId(),
      ...chunk,
    });
  }

  sendEnd(): Promise<WsAck> {
    return this.emitWithAck('end');
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.status.set('disconnected');
    this.sessionId.set(null);
  }

  private emitWithAck(event: string, payload?: unknown): Promise<WsAck> {
    const socket = this.socket;
    if (!socket) {
      return Promise.reject(new Error('WebSocket is not connected'));
    }
    return new Promise((resolve, reject) => {
      socket.emit(event, payload, (response: unknown) => {
        const ack = response as WsAck | undefined;
        if (ack && ack.ok === true) {
          resolve(ack);
        } else {
          reject(
            new Error(
              `ack failed for '${event}': ${JSON.stringify(response)}`,
            ),
          );
        }
      });
    });
  }
}
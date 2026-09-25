import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import {
  SourceLanguage,
  TargetLanguage,
} from '@simultaneous-transcription-ae/shared-types';
import type { AudioChunkDto } from '@simultaneous-transcription-ae/shared-types';
import { Logger } from '@nestjs/common';
import { AudioPipelineService } from '../pipeline/audio-pipeline.service';

interface IngestConnection {
  sessionId: string;
  mimeType: string;
  chain: Promise<unknown>;
}

@WebSocketGateway({
  path: '/ingest',
  cors: { origin: true, credentials: true },
})
export class IngestionGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(IngestionGateway.name);
  private readonly connections = new Map<string, IngestConnection>();

  constructor(private readonly pipeline: AudioPipelineService) {}

  handleConnection(client: Socket): void {
    const query = client.handshake.query;
    const sessionId = this.asString(query['sessionId']);
    if (!sessionId) {
      this.logger.warn(`Rejecting connection without sessionId`);
      client.disconnect(true);
      return;
    }

    if (!this.pipeline.getStatus(sessionId)) {
      this.pipeline.registerSession({
        id: sessionId,
        sourceLanguage: this.parseLang(this.asString(query['sourceLang']), SourceLanguage.EN),
        targetLanguage: this.parseLang(this.asString(query['targetLang']), TargetLanguage.ES),
      });
    }

    this.connections.set(client.id, {
      sessionId,
      mimeType: this.asString(query['mimeType']) || 'audio/webm',
      chain: Promise.resolve(),
    });
    this.logger.log(`Ingestion socket connected for session ${sessionId}`);
  }

  handleDisconnect(client: Socket): void {
    const connection = this.connections.get(client.id);
    if (!connection) {
      return;
    }
    if (this.pipeline.getStatus(connection.sessionId)) {
      void this.enqueue(client.id, () =>
        this.pipeline.endSession(connection.sessionId),
      ).catch((error: unknown) => {
        this.logger.debug(
          `Session ${connection.sessionId} already ended on disconnect (${String(error)})`,
        );
      });
    }
    this.connections.delete(client.id);
  }

  @SubscribeMessage('audio')
  onAudio(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AudioChunkDto,
  ): Promise<{ ok: boolean }> {
    const connection = this.requireConnection(client.id);
    const data = Buffer.from(payload.data, 'base64');
    if (data.byteLength === 0) {
      return Promise.resolve({ ok: true });
    }
    return this.enqueue(client.id, () =>
      this.pipeline.ingest(
        connection.sessionId,
        new Uint8Array(data),
        payload.mimeType || connection.mimeType,
      ),
    ).then(() => ({ ok: true }));
  }

  @SubscribeMessage('audio-binary')
  onAudioBinary(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: Buffer,
  ): Promise<{ ok: boolean }> {
    const connection = this.requireConnection(client.id);
    if (payload.byteLength === 0) {
      return Promise.resolve({ ok: true });
    }
    return this.enqueue(client.id, () =>
      this.pipeline.ingest(
        connection.sessionId,
        new Uint8Array(payload),
        connection.mimeType,
      ),
    ).then(() => ({ ok: true }));
  }

  @SubscribeMessage('end')
  onEnd(@ConnectedSocket() client: Socket): Promise<{ ok: boolean }> {
    const connection = this.requireConnection(client.id);
    return this.enqueue(client.id, () =>
      this.pipeline.endSession(connection.sessionId),
    ).then(() => ({ ok: true }));
  }

  private enqueue(
    clientId: string,
    op: () => Promise<void>,
  ): Promise<void> {
    const connection = this.connections.get(clientId);
    if (!connection) {
      return Promise.resolve();
    }
    const next = connection.chain.then(op);
    connection.chain = next.catch(() => undefined);
    return next;
  }

  private requireConnection(clientId: string): IngestConnection {
    const connection = this.connections.get(clientId);
    if (!connection) {
      throw new Error('Ingestion connection is not registered');
    }
    return connection;
  }

  private parseLang<T extends string>(value: string | null, fallback: T): T {
    if (value === SourceLanguage.EN || value === SourceLanguage.ES) {
      return value as T;
    }
    return fallback;
  }

  private asString(value: unknown): string | null {
    if (Array.isArray(value)) {
      return typeof value[0] === 'string' ? value[0] : null;
    }
    return typeof value === 'string' ? value : null;
  }
}
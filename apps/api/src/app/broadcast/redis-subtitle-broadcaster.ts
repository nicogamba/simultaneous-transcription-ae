import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  SessionStatus,
  TranscriptionPayload,
  TranscriptionResult,
  transcriptionPayload,
} from '@simultaneous-transcription-ae/shared-types';
import Redis from 'ioredis';
import {
  ISubtitleBroadcaster,
  stageChannel,
} from './subtitle-broadcaster.interface';

export const REDIS_URL = Symbol('REDIS_URL');

@Injectable()
export class RedisSubtitleBroadcaster
  implements ISubtitleBroadcaster, OnModuleDestroy
{
  private readonly logger = new Logger(RedisSubtitleBroadcaster.name);
  private readonly publisher: Redis;

  constructor(@Inject(REDIS_URL) redisUrl: string) {
    this.publisher = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });
    this.publisher.on('error', (error: Error) => {
      this.logger.error(`Redis publisher error: ${error.message}`);
    });
  }

  async publishTranscription(result: TranscriptionResult): Promise<void> {
    const payload: TranscriptionPayload = transcriptionPayload({
      sessionId: result.sessionId,
      event: 'transcription',
      sequenceId: result.sequenceId,
      result,
      status: null,
    });
    await this.publish(result.sessionId, payload);
  }

  async publishStatus(
    sessionId: string,
    status: SessionStatus,
  ): Promise<void> {
    const payload: TranscriptionPayload = transcriptionPayload({
      sessionId,
      event: 'status',
      sequenceId: null,
      result: null,
      status,
    });
    await this.publish(sessionId, payload);
  }

  async publishError(sessionId: string, error: string): Promise<void> {
    const payload: TranscriptionPayload = transcriptionPayload({
      sessionId,
      event: 'error',
      sequenceId: null,
      result: null,
      error,
    });
    await this.publish(sessionId, payload);
  }

  async onModuleDestroy(): Promise<void> {
    await this.publisher.quit();
  }

  private async publish(
    sessionId: string,
    payload: TranscriptionPayload,
  ): Promise<void> {
    try {
      await this.publisher.publish(
        stageChannel(sessionId),
        JSON.stringify(payload),
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish to ${stageChannel(sessionId)}`,
        error,
      );
    }
  }
}
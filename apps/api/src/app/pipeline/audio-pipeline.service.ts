import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  CreateSessionDto,
  SessionStatus,
  VadChunk,
} from '@simultaneous-transcription-ae/shared-types';
import { AudioAcousticService } from '../audio/audio-acoustic.service';
import { SileroVadService } from '../audio/silero-vad.service';
import { SUBTITLE_BROADCASTER } from '../broadcast/subtitle-broadcaster.interface';
import type { ISubtitleBroadcaster } from '../broadcast/subtitle-broadcaster.interface';
import { TranscriptionEngine } from '../ai/transcription-engine.service';

export const PCM_MIME_TYPE = 'audio/pcm';

interface PipelineSession {
  config: CreateSessionDto;
  status: SessionStatus;
  chain: Promise<unknown>;
  inFlight: Set<Promise<unknown>>;
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} does not exist`);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionAlreadyExistsError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} already exists`);
    this.name = 'SessionAlreadyExistsError';
  }
}

@Injectable()
export class AudioPipelineService implements OnModuleDestroy {
  private readonly logger = new Logger(AudioPipelineService.name);
  private readonly sessions = new Map<string, PipelineSession>();

  constructor(
    private readonly acoustic: AudioAcousticService,
    private readonly vad: SileroVadService,
    private readonly engine: TranscriptionEngine,
    @Inject(SUBTITLE_BROADCASTER)
    private readonly broadcaster: ISubtitleBroadcaster,
  ) {}

  registerSession(dto: CreateSessionDto): void {
    if (this.sessions.has(dto.id)) {
      throw new SessionAlreadyExistsError(dto.id);
    }
    const session: PipelineSession = {
      config: dto,
      status: SessionStatus.IDLE,
      chain: Promise.resolve(),
      inFlight: new Set(),
    };
    this.sessions.set(dto.id, session);
    void this.setStatus(dto.id, SessionStatus.ACTIVE);
    this.logger.log(`Session ${dto.id} registered`);
  }

  async ingest(
    sessionId: string,
    data: Uint8Array,
    mimeType: string,
  ): Promise<void> {
    const session = this.requireSession(sessionId);
    const op = this.chain(session, async () => {
      if (session.status !== SessionStatus.ACTIVE) {
        this.logger.warn(`Session ${sessionId} is not active; dropping chunk`);
        return;
      }
      let pcm: Uint8Array;
      if (mimeType === PCM_MIME_TYPE) {
        pcm = data;
      } else {
        try {
          pcm = await this.acoustic.transcodeToPcm16kMono(data, mimeType);
        } catch (error) {
          this.logger.error(
            `[${sessionId}] failed to transcode ${mimeType} chunk; dropping`,
            error,
          );
          return;
        }
      }
      const chunks = await this.vad.ingestPcm(sessionId, pcm);
      const dispatched = this.dispatchChunks(session, chunks);
      await Promise.allSettled(dispatched);
    });
    return op;
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId);
    this.setStatus(sessionId, SessionStatus.PAUSED);

    const flushed = await this.chain(session, async () =>
      this.vad.flushSession(sessionId),
    );
    this.dispatchChunks(session, flushed);

    await Promise.allSettled([...session.inFlight]);
    this.vad.endSession(sessionId);
    session.inFlight.clear();
    this.sessions.delete(sessionId);
    await this.broadcaster.publishStatus(sessionId, SessionStatus.ENDED);
    this.logger.log(`Session ${sessionId} ended`);
  }

  getStatus(sessionId: string): SessionStatus | null {
    return this.sessions.get(sessionId)?.status ?? null;
  }

  sessionCount(): number {
    return this.sessions.size;
  }

  async onModuleDestroy(): Promise<void> {
    for (const sessionId of [...this.sessions.keys()]) {
      try {
        await this.endSession(sessionId);
      } catch (error) {
        this.logger.error(
          `Failed to gracefully end session ${sessionId}`,
          error,
        );
      }
    }
    this.sessions.clear();
    this.logger.log('All pipeline sessions cleaned up.');
  }

  private requireSession(sessionId: string): PipelineSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    return session;
  }

  private chain<T>(
    session: PipelineSession,
    op: () => Promise<T>,
  ): Promise<T> {
    const next = session.chain.then(op);
    session.chain = next.catch(() => undefined);
    return next;
  }

  private dispatchChunks(
    session: PipelineSession,
    chunks: VadChunk[],
  ): Array<Promise<unknown>> {
    const dispatched: Array<Promise<unknown>> = [];
    for (const chunk of chunks) {
      const promise = this.engine
        .processChunk(
          chunk,
          session.config.sourceLanguage,
          session.config.targetLanguage,
        )
        .catch((error: unknown) => {
          this.logger.error(
            `[${session.config.id}] chunk #${chunk.sequenceId} failed`,
            error,
          );
          void this.broadcaster.publishError(
            session.config.id,
            `chunk #${chunk.sequenceId} failed`,
          );
        });
      session.inFlight.add(promise);
      void promise.finally(() => session.inFlight.delete(promise));
      dispatched.push(promise);
    }
    return dispatched;
  }

  private async setStatus(
    sessionId: string,
    status: SessionStatus,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
    }
    await this.broadcaster.publishStatus(sessionId, status);
  }
}
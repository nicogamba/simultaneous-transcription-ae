import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { VadChunk } from '@simultaneous-transcription-ae/shared-types';
import { int16ToFloat32, msToSamples, samplesToMs } from './audio.utils';
import { PIPELINE_CONFIG } from './pipeline.config';
import type { PipelineConfig } from './pipeline.config';
import { VAD_PROCESSOR } from './vad.processor';
import type { IVadProcessor } from './vad.processor';

interface SessionVadState {
  pending: Uint8Array;
  pendingStartMs: number;
}

@Injectable()
export class SileroVadService implements OnModuleDestroy {
  private readonly logger = new Logger(SileroVadService.name);
  private readonly sessions = new Map<string, SessionVadState>();
  private readonly sequenceCounters = new Map<string, number>();

  constructor(
    @Inject(VAD_PROCESSOR) private readonly vad: IVadProcessor,
    @Inject(PIPELINE_CONFIG) private readonly config: PipelineConfig,
  ) {}

  async ingestPcm(sessionId: string, pcm: Uint8Array): Promise<VadChunk[]> {
    if (pcm.byteLength === 0) {
      return [];
    }
    const state = this.getOrCreateState(sessionId);
    const appended = this.append(state, pcm);
    return this.cut(state, appended.totalSamples, sessionId);
  }

  async flushSession(sessionId: string): Promise<VadChunk[]> {
    const state = this.sessions.get(sessionId);
    if (!state || state.pending.byteLength === 0) {
      return [];
    }
    const chunks = this.emit(state, state.pending.byteLength / 2, sessionId);
    state.pending = new Uint8Array(0);
    return chunks;
  }

  endSession(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.pending = new Uint8Array(0);
      this.sessions.delete(sessionId);
    }
    this.sequenceCounters.delete(sessionId);
  }

  resetSession(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.pending = new Uint8Array(0);
    }
  }

  onModuleDestroy(): void {
    this.sessions.clear();
    this.sequenceCounters.clear();
    this.logger.log('Cleared all VAD session state.');
  }

  private getOrCreateState(sessionId: string): SessionVadState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = { pending: new Uint8Array(0), pendingStartMs: 0 };
      this.sessions.set(sessionId, state);
      this.sequenceCounters.set(sessionId, 0);
    }
    return state;
  }

  private append(state: SessionVadState, pcm: Uint8Array): { totalSamples: number } {
    const merged = new Uint8Array(state.pending.byteLength + pcm.byteLength);
    merged.set(state.pending, 0);
    merged.set(pcm, state.pending.byteLength);
    state.pending = merged;
    return { totalSamples: state.pending.byteLength / 2 };
  }

  private async cut(
    state: SessionVadState,
    totalSamples: number,
    sessionId: string,
  ): Promise<VadChunk[]> {
    const silenceSamples = msToSamples(
      this.config.silenceThresholdMs,
      this.config.sampleRate,
    );
    const maxChunkSamples = msToSamples(
      this.config.maxChunkDurationMs,
      this.config.sampleRate,
    );

    const audio = int16ToFloat32(state.pending);
    const segments = await this.vad.run(audio, this.config.sampleRate);

    const lastSpeechEnd =
      segments.length > 0 ? segments[segments.length - 1].end : 0;
    const trailingSilence = totalSamples - lastSpeechEnd;

    let cutSample = 0;
    if (totalSamples >= maxChunkSamples) {
      if (lastSpeechEnd > 0) {
        cutSample = Math.min(lastSpeechEnd, maxChunkSamples);
      } else {
        state.pending = new Uint8Array(0);
        return [];
      }
    } else if (trailingSilence >= silenceSamples && lastSpeechEnd > 0) {
      cutSample = lastSpeechEnd;
    }

    if (cutSample <= 0) {
      return [];
    }
    return this.emit(state, cutSample, sessionId);
  }

  private emit(
    state: SessionVadState,
    cutSamples: number,
    sessionId: string,
  ): VadChunk[] {
    const cutBytes = cutSamples * this.config.sampleWidthBytes;
    if (cutBytes <= 0 || cutBytes > state.pending.byteLength) {
      return [];
    }

    const content = state.pending.slice(0, cutBytes);
    const remainder = state.pending.slice(cutBytes);
    state.pending = remainder;
    state.pendingStartMs += samplesToMs(cutSamples, this.config.sampleRate);

    if (content.byteLength === 0) {
      return [];
    }

    const sequenceId = this.sequenceCounters.get(sessionId) ?? 0;
    this.sequenceCounters.set(sessionId, sequenceId + 1);

    this.logger.debug(
      `[${sessionId}] VAD chunk #${sequenceId} ${content.byteLength} bytes`,
    );

    const chunk: VadChunk = {
      sessionId,
      sequenceId,
      data: content,
      startMs: state.pendingStartMs - samplesToMs(cutSamples, this.config.sampleRate),
      endMs: state.pendingStartMs,
    };
    return [chunk];
  }
}
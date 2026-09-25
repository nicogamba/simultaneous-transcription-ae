import { stageChannel } from '../subtitle-broadcaster.interface';
import type { ISubtitleBroadcaster } from '../subtitle-broadcaster.interface';
import {
  SessionStatus,
  TranscriptionPayload,
  TranscriptionResult,
} from '@simultaneous-transcription-ae/shared-types';

export class FakeBroadcaster implements ISubtitleBroadcaster {
  transcriptions: TranscriptionResult[] = [];
  statuses: Array<{ sessionId: string; status: SessionStatus }> = [];
  errors: Array<{ sessionId: string; error: string }> = [];
  publishedChannels: string[] = [];

  async publishTranscription(result: TranscriptionResult): Promise<void> {
    this.transcriptions.push(result);
    this.publishedChannels.push(stageChannel(result.sessionId));
  }

  async publishStatus(sessionId: string, status: SessionStatus): Promise<void> {
    this.statuses.push({ sessionId, status });
    this.publishedChannels.push(stageChannel(sessionId));
  }

  async publishError(sessionId: string, error: string): Promise<void> {
    this.errors.push({ sessionId, error });
    this.publishedChannels.push(stageChannel(sessionId));
  }

  payloads(): TranscriptionPayload[] {
    return [
      ...this.transcriptions.map((result) => ({
        sessionId: result.sessionId,
        event: 'transcription' as const,
        sequenceId: result.sequenceId,
        result,
        status: null,
        error: null,
        serverTimestamp: Date.now(),
      })),
    ];
  }
}
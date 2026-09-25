import { SessionStatus } from '@simultaneous-transcription-ae/shared-types';
import { TranscriptionResult } from '@simultaneous-transcription-ae/shared-types';

export interface ISubtitleBroadcaster {
  publishTranscription(result: TranscriptionResult): Promise<void>;
  publishStatus(sessionId: string, status: SessionStatus): Promise<void>;
  publishError(sessionId: string, error: string): Promise<void>;
}

export const SUBTITLE_BROADCASTER = Symbol('SUBTITLE_BROADCASTER');

export function stageChannel(sessionId: string): string {
  return `stage:${sessionId}:subtitles`;
}
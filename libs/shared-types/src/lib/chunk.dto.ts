import { SourceLanguage, TargetLanguage } from './enums';

export interface AudioChunkDto {
  sessionId: string;
  mimeType: string;
  data: string;
  clientTimestamp: number;
}

export interface VadChunk {
  sessionId: string;
  sequenceId: number;
  data: Uint8Array;
  startMs: number;
  endMs: number;
}

export interface CreateSessionDto {
  id: string;
  sourceLanguage: SourceLanguage;
  targetLanguage: TargetLanguage;
  maxChunkDurationMs?: number;
  silenceThresholdMs?: number;
}
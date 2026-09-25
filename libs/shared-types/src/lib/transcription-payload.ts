import { ProviderType, SessionStatus } from './enums';
import { TranscriptionResult } from './transcription-result';

export interface TranscriptionPayload {
  sessionId: string;
  event: 'transcription' | 'status' | 'error';
  sequenceId: number | null;
  result: TranscriptionResult | null;
  status: SessionStatus | null;
  error: string | null;
  serverTimestamp: number;
}

export function transcriptionPayload(
  payload: Partial<TranscriptionPayload> & { sessionId: string },
): TranscriptionPayload {
  return {
    event: 'transcription',
    sequenceId: null,
    result: null,
    status: null,
    error: null,
    serverTimestamp: Date.now(),
    ...payload,
  };
}

export function providerTypeFromString(value: string | undefined): ProviderType {
  if (value === ProviderType.GEMINI) {
    return ProviderType.GEMINI;
  }
  return ProviderType.MOCK;
}
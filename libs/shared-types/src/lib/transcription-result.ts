import { SourceLanguage, TargetLanguage } from './enums';

export interface TranslationRequest {
  data: Uint8Array;
  sourceLanguage: SourceLanguage;
  targetLanguage: TargetLanguage;
  sessionId: string;
  sequenceId: number;
}

export interface TranslationResponse {
  sourceText: string;
  translatedText: string | null;
}

export interface TranscriptionResult {
  sessionId: string;
  sequenceId: number;
  sourceLanguage: SourceLanguage;
  targetLanguage: TargetLanguage;
  sourceText: string;
  translatedText: string | null;
  startMs: number;
  endMs: number;
  createdAt: number;
}
import { Inject, Injectable } from '@nestjs/common';
import {
  SourceLanguage,
  TargetLanguage,
  TranslationRequest,
  TranscriptionResult,
  VadChunk,
} from '@simultaneous-transcription-ae/shared-types';
import type { ITranslationProvider } from '@simultaneous-transcription-ae/shared-types';
import { SUBTITLE_BROADCASTER } from '../broadcast/subtitle-broadcaster.interface';
import type { ISubtitleBroadcaster } from '../broadcast/subtitle-broadcaster.interface';
import { TRANSLATION_PROVIDER } from './translation/translation-provider.factory';

@Injectable()
export class TranscriptionEngine {
  constructor(
    @Inject(TRANSLATION_PROVIDER)
    private readonly provider: ITranslationProvider,
    @Inject(SUBTITLE_BROADCASTER)
    private readonly broadcaster: ISubtitleBroadcaster,
  ) {}

  async processChunk(
    chunk: VadChunk,
    sourceLanguage: SourceLanguage,
    targetLanguage: TargetLanguage,
  ): Promise<TranscriptionResult> {
    const request: TranslationRequest = {
      data: chunk.data,
      sourceLanguage,
      targetLanguage,
      sessionId: chunk.sessionId,
      sequenceId: chunk.sequenceId,
    };

    const response = await this.provider.processAudioChunk(request);

    const result: TranscriptionResult = {
      sessionId: chunk.sessionId,
      sequenceId: chunk.sequenceId,
      sourceLanguage,
      targetLanguage,
      sourceText: response.sourceText,
      translatedText: response.translatedText,
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      createdAt: Date.now(),
    };

    await this.broadcaster.publishTranscription(result);
    return result;
  }
}
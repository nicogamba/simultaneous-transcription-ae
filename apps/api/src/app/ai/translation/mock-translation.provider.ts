import { Injectable, Logger } from '@nestjs/common';
import {
  ITranslationProvider,
  languagesDiffer,
  ProviderType,
  TranslationRequest,
  TranslationResponse,
} from '@simultaneous-transcription-ae/shared-types';

@Injectable()
export class MockTranslationProvider implements ITranslationProvider {
  readonly type = ProviderType.MOCK;
  private readonly logger = new Logger(MockTranslationProvider.name);

  async processAudioChunk(
    request: TranslationRequest,
  ): Promise<TranslationResponse> {
    this.logger.debug(
      `Mock processing chunk #${request.sequenceId} (${request.data.byteLength} bytes)`,
    );
    await new Promise((resolve) => setTimeout(resolve, 40));
    const sourceText = `[mock:${request.sequenceId}] ${request.data.byteLength} bytes`;
    const needsTranslation = languagesDiffer(
      request.sourceLanguage,
      request.targetLanguage,
    );
    return {
      sourceText,
      translatedText: needsTranslation
        ? `[traducción ${request.sequenceId}] ${request.data.byteLength} bytes`
        : null,
    };
  }
}
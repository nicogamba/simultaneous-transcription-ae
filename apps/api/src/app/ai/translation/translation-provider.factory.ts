import { ProviderType } from '@simultaneous-transcription-ae/shared-types';
import { Logger } from '@nestjs/common';
import { GeminiTranslationProvider } from './gemini-translation.provider';
import { ITranslationProvider } from '@simultaneous-transcription-ae/shared-types';
import { MockTranslationProvider } from './mock-translation.provider';

export interface AiProviderConfig {
  provider: ProviderType;
  geminiApiKey: string;
  geminiModel: string;
}

export const TRANSLATION_PROVIDER = Symbol('TRANSLATION_PROVIDER');

export function createTranslationProvider(
  config: AiProviderConfig,
): ITranslationProvider {
  const logger = new Logger('TranslationProviderFactory');
  switch (config.provider) {
    case ProviderType.GEMINI:
      logger.log(`Using GeminiTranslationProvider (model ${config.geminiModel})`);
      return new GeminiTranslationProvider({
        apiKey: config.geminiApiKey,
        model: config.geminiModel,
      });
    case ProviderType.MOCK:
    default:
      logger.log('Using MockTranslationProvider');
      return new MockTranslationProvider();
  }
}
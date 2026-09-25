import { Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/app.config';
import { TranscriptionEngine } from './transcription-engine.service';
import {
  createTranslationProvider,
  TRANSLATION_PROVIDER,
} from './translation/translation-provider.factory';

@Module({
  providers: [
    {
      provide: TRANSLATION_PROVIDER,
      useFactory: (config: AppConfig) =>
        createTranslationProvider({
          provider: config.aiProvider,
          geminiApiKey: config.geminiApiKey,
          geminiModel: config.geminiModel,
        }),
      inject: [APP_CONFIG],
    },
    TranscriptionEngine,
  ],
  exports: [TranscriptionEngine],
})
export class AiModule {}
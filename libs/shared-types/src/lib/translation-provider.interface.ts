import { ProviderType } from './enums';
import { TranslationRequest, TranslationResponse } from './transcription-result';

export interface ITranslationProvider {
  readonly type: ProviderType;
  processAudioChunk(
    request: TranslationRequest,
  ): Promise<TranslationResponse>;
}
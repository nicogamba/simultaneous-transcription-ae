import { ProviderType } from '@simultaneous-transcription-ae/shared-types';
import { createTranslationProvider } from './translation-provider.factory';
import { MockTranslationProvider } from '../translation/mock-translation.provider';
import { GeminiTranslationProvider } from '../translation/gemini-translation.provider';

describe('TranslationProviderFactory', () => {
  it('returns the mock provider by default', () => {
    const provider = createTranslationProvider({
      provider: ProviderType.MOCK,
      geminiApiKey: '',
      geminiModel: 'gemini-3.8-flash',
    });
    expect(provider).toBeInstanceOf(MockTranslationProvider);
    expect(provider.type).toBe(ProviderType.MOCK);
  });

  it('returns the gemini provider when configured', () => {
    const provider = createTranslationProvider({
      provider: ProviderType.GEMINI,
      geminiApiKey: 'test-key',
      geminiModel: 'gemini-3.8-flash',
    });
    expect(provider).toBeInstanceOf(GeminiTranslationProvider);
    expect(provider.type).toBe(ProviderType.GEMINI);
  });
});
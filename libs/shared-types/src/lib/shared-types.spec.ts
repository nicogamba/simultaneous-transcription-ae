import { providerTypeFromString, transcriptionPayload } from './transcription-payload';
import { ProviderType, SourceLanguage, TargetLanguage } from './enums';

describe('shared-types', () => {
  it('builds a transcription payload with defaults', () => {
    const payload = transcriptionPayload({ sessionId: 's1' });
    expect(payload.sessionId).toBe('s1');
    expect(payload.event).toBe('transcription');
    expect(payload.serverTimestamp).toBeGreaterThan(0);
  });

  it('resolves provider type from string', () => {
    expect(providerTypeFromString('gemini')).toBe(ProviderType.GEMINI);
    expect(providerTypeFromString('anything')).toBe(ProviderType.MOCK);
    expect(providerTypeFromString(undefined)).toBe(ProviderType.MOCK);
  });

  it('exposes language enums', () => {
    expect(SourceLanguage.EN).toBe('en');
    expect(TargetLanguage.ES).toBe('es');
  });
});
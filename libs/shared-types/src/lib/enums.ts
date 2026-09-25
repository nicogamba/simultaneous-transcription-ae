export enum SourceLanguage {
  EN = 'en',
  ES = 'es',
}

export enum TargetLanguage {
  EN = 'en',
  ES = 'es',
}

export enum SessionStatus {
  IDLE = 'idle',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ENDED = 'ended',
}

export enum ProviderType {
  MOCK = 'mock',
  GEMINI = 'gemini',
}

export type AnyLanguage = SourceLanguage | TargetLanguage;

export function languagesDiffer(
  a: AnyLanguage,
  b: AnyLanguage,
): boolean {
  return a !== b;
}
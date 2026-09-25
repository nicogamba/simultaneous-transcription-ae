import { ProviderType, providerTypeFromString } from '@simultaneous-transcription-ae/shared-types';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  port: number;
  redisUrl: string;
  aiProvider: ProviderType;
  geminiApiKey: string;
  geminiModel: string;
}

export function loadAppConfig(
  env: Record<string, string | undefined>,
): AppConfig {
  return {
    port: Number(env['PORT'] ?? 3000),
    redisUrl: env['REDIS_URL'] ?? 'redis://localhost:6379',
    aiProvider: providerTypeFromString(env['AI_PROVIDER']),
    geminiApiKey: env['GEMINI_API_KEY'] ?? '',
    geminiModel: env['GEMINI_MODEL'] ?? 'gemini-3.8-flash',
  };
}
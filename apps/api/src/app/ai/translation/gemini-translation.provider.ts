import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import {
  ITranslationProvider,
  ProviderType,
  TranslationRequest,
  TranslationResponse,
} from '@simultaneous-transcription-ae/shared-types';
import CircuitBreaker from 'opossum';
import { pcmToWav } from '../../audio/audio.utils';

export interface GeminiProviderConfig {
  apiKey: string;
  model: string;
}

@Injectable()
export class GeminiTranslationProvider
  implements ITranslationProvider, OnModuleDestroy
{
  readonly type = ProviderType.GEMINI;
  private readonly logger = new Logger(GeminiTranslationProvider.name);
  private readonly client: GoogleGenAI;
  private readonly breaker: CircuitBreaker<
    [TranslationRequest],
    TranslationResponse
  >;

  constructor(private readonly config: GeminiProviderConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.breaker = new CircuitBreaker(
      (request: TranslationRequest) => this.callGemini(request),
      {
        timeout: 45000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
        rollingCountTimeout: 60000,
        volumeThreshold: 5,
        name: 'gemini-translation',
      },
    );
    this.breaker.on('open', () =>
      this.logger.warn('Gemini circuit breaker OPEN (429/5xx threshold hit)'),
    );
    this.breaker.on('halfOpen', () =>
      this.logger.warn('Gemini circuit breaker half-open, probing...'),
    );
  }

  async processAudioChunk(
    request: TranslationRequest,
  ): Promise<TranslationResponse> {
    try {
      return await this.breaker.fire(request);
    } catch (error) {
      this.logger.error(
        `Gemini request failed for chunk #${request.sequenceId}`,
        error,
      );
      return {
        sourceText: '',
        translatedText: '',
      };
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.breaker.shutdown();
  }

  private async callGemini(
    request: TranslationRequest,
  ): Promise<TranslationResponse> {
    const wav = pcmToWav(request.data, 16000);
    const base64 = Buffer.from(wav).toString('base64');

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.generate(base64, request);
      } catch (error) {
        lastError = error;
        if (!this.isTransient(error)) {
          throw error;
        }
        const delay = 500 * 2 ** attempt;
        this.logger.warn(
          `Transient Gemini error, retrying in ${delay}ms (attempt ${attempt + 1}/3)`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  private async generate(
    base64: string,
    request: TranslationRequest,
  ): Promise<TranslationResponse> {
    const response = await this.client.models.generateContent({
      model: this.config.model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'audio/wav',
                data: base64,
              },
            },
            {
              text: [
                `Transcribe the audio. The spoken language is ${request.sourceLanguage}.`,
                `If the target language ${request.targetLanguage} differs from the source,`,
                'also translate the transcript. Respond with STRICT JSON matching this schema:',
                '{"sourceText": string, "translatedText": string|null}.',
                'translatedText must be null when source and target languages are equal.',
              ].join(' '),
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const raw =
      response.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('') ?? '';

    return this.parseResponse(raw);
  }

  private isTransient(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const status = (error as { status?: number }).status;
      return status === 429 || status === 500 || status === 502 || status === 503;
    }
    return false;
  }

  private parseResponse(raw: string): TranslationResponse {
    try {
      const parsed = JSON.parse(raw) as Partial<TranslationResponse>;
      return {
        sourceText: parsed.sourceText ?? '',
        translatedText: parsed.translatedText ?? null,
      };
    } catch {
      return {
        sourceText: raw,
        translatedText: null,
      };
    }
  }
}
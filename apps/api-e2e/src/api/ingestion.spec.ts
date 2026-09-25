import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, Socket } from 'socket.io-client';
import Redis from 'ioredis';
import {
  TranscriptionPayload,
  TranscriptionResult,
} from '@simultaneous-transcription-ae/shared-types';
import { AppModule } from '@simultaneous-transcription-ae/api/app/app.module';
import { FakeVadProcessor } from '@simultaneous-transcription-ae/api/app/audio/fake-vad.processor';
import { VAD_PROCESSOR } from '@simultaneous-transcription-ae/api/app/audio/vad.processor';
import { createSseReader } from './sse-reader';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

let app: INestApplication;
let baseUrl: string;
let redis: Redis;

async function startApp(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(VAD_PROCESSOR)
    .useValue(new FakeVadProcessor())
    .compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableCors();
  await app.init();
  await app.listen(0);
  const address = app.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${(address as { port: number }).port}`;
}

function wavTone(durationMs: number, sampleRate = 16000): Buffer {
  const samples = Math.floor((durationMs * sampleRate) / 1000);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    buffer.writeInt16LE(
      Math.round((Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000)),
      44 + i * 2,
    );
  }
  return buffer;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out: ${label}`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: Error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

describe('Ingestion & SSE e2e', () => {
  beforeAll(async () => {
    redis = new Redis(REDIS_URL);
    await startApp();
  });

  afterAll(async () => {
    await app.close();
    await redis.quit();
  }, 15000);

  describe('SSE broadcast', () => {
    it('emits events published to the Redis stage channel', async () => {
      const sessionId = `sse-${Date.now()}`;
      const reader = createSseReader(
        `${baseUrl}/api/stage/${sessionId}/subtitles`,
      );

      const payload: TranscriptionPayload = {
        sessionId,
        event: 'transcription',
        sequenceId: 3,
        result: {
          sessionId,
          sequenceId: 3,
          sourceLanguage: 'en',
          targetLanguage: 'es',
          sourceText: 'hello',
          translatedText: 'hola',
          startMs: 0,
          endMs: 1000,
          createdAt: Date.now(),
        },
        status: null,
        error: null,
        serverTimestamp: Date.now(),
      };

      await new Promise((resolve) => setTimeout(resolve, 250));
      await redis.publish(
        `stage:${sessionId}:subtitles`,
        JSON.stringify(payload),
      );

      const received = await withTimeout(
        reader.next().then((data) => JSON.parse(data) as TranscriptionPayload),
        5000,
        'waiting for SSE event',
      );
      reader.close();

      expect(received.sequenceId).toBe(3);
      expect(received.result?.translatedText).toBe('hola');
    });
  });

  describe('WebSocket ingestion', () => {
    it(
      'transcribes ingested audio and broadcasts via SSE',
      async () => {
        const sessionId = `ws-${Date.now()}`;
        const socket: Socket = io(`${baseUrl}`, {
          path: '/ingest',
          query: {
            sessionId,
            sourceLang: 'en',
            targetLang: 'es',
            mimeType: 'audio/wav',
          },
          transports: ['websocket'],
          forceNew: true,
        });

      await withTimeout(
        new Promise<void>((resolve, reject) => {
          socket.on('connect', () => resolve());
          socket.on('connect_error', reject);
        }),
        5000,
        'connecting socket.io',
      );

      const reader = createSseReader(
        `${baseUrl}/api/stage/${sessionId}/subtitles`,
      );
      await new Promise((resolve) => setTimeout(resolve, 300));

      const wav = wavTone(400);
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          socket.emit(
            'audio',
            {
              sessionId,
              mimeType: 'audio/wav',
              data: wav.toString('base64'),
              clientTimestamp: Date.now(),
            },
            (response: unknown) => {
              const ack = response as { ok?: boolean };
              if (ack && ack.ok === true) {
                resolve();
              } else {
                reject(new Error(`audio ack: ${JSON.stringify(response)}`));
              }
            },
          );
        }),
        8000,
        'audio ack',
      );

      await withTimeout(
        new Promise<void>((resolve, reject) => {
          socket.emit('end', (response: unknown) => {
            const ack = response as { ok?: boolean };
            if (ack && ack.ok === true) {
              resolve();
            } else {
              reject(new Error(`end ack: ${JSON.stringify(response)}`));
            }
          });
        }),
        8000,
        'end ack',
      );
      socket.disconnect();

      const received = await withTimeout(
        (async () => {
          for (let i = 0; i < 10; i++) {
            const data = await reader.next();
            const payload = JSON.parse(data) as TranscriptionPayload;
            if (payload.event === 'error') {
              throw new Error(`Broadcast error event: ${payload.error}`);
            }
            if (payload.event === 'transcription' && payload.result) {
              return payload.result;
            }
          }
          throw new Error('No transcription payload received');
        })(),
        10000,
        'waiting for transcription on SSE',
      );
      reader.close();

      expect(received.sessionId).toBe(sessionId);
      expect(received.sourceLanguage).toBe('en');
      expect(received.targetLanguage).toBe('es');
      expect(received.sourceText).toContain('mock');
      },
      20000,
    );
  });
});
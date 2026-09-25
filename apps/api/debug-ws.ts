import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { io } from 'socket.io-client';
import Redis from 'ioredis';
import { AppModule } from './src/app/app.module';
import { FakeVadProcessor } from './src/app/audio/fake-vad.processor';
import { VAD_PROCESSOR } from './src/app/audio/vad.processor';
import { createSseReader } from '../api-e2e/src/api/sse-reader';

async function main() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(VAD_PROCESSOR)
    .useValue(new FakeVadProcessor())
    .compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableCors();
  await app.init();
  await app.listen(0);
  const addr = app.getHttpServer().address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  console.log('SERVER UP at', baseUrl, 'AI_PROVIDER=', process.env.AI_PROVIDER);

  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  redis.on('message', (ch, msg) => console.log('REDIS <--', ch, msg.slice(0, 120)));
  await redis.subscribe('stage:dbg-1:subtitles');
  console.log('subscribed to stage:dbg-1:subtitles');

  const sessionId = 'dbg-1';
  const socket = io(baseUrl, {
    path: '/ingest',
    query: { sessionId, sourceLang: 'en', targetLang: 'es', mimeType: 'audio/wav' },
    transports: ['websocket'],
    forceNew: true,
  });
  socket.on('connect', () => console.log('SOCKET connected'));
  socket.on('connect_error', (e) => console.log('SOCKET error', e.message));
  socket.on('disconnect', (r) => console.log('SOCKET disconnected', r));

  await new Promise((r) => setTimeout(r, 800));

  function wavTone(ms: number, sr = 16000): Buffer {
    const n = Math.floor((ms * sr) / 1000);
    const b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
    b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
    b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28);
    b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36);
    b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / sr) * 8000), 44 + i * 2);
    return b;
  }

  socket.emit('audio', {
    sessionId,
    mimeType: 'audio/wav',
    data: wavTone(400).toString('base64'),
    clientTimestamp: Date.now(),
  });
  console.log('emitted audio');
  socket.emit('end');
  console.log('emitted end');
  await new Promise((r) => setTimeout(r, 2000));
  socket.disconnect();
  await new Promise((r) => setTimeout(r, 2000));

  // try SSE reader too
  const reader = createSseReader(`${baseUrl}/api/stage/${sessionId}/subtitles`);
  const t = setTimeout(() => console.log('SSE: nothing received'), 3000);
  try {
    const data = await reader.next();
    clearTimeout(t);
    console.log('SSE -->', data.slice(0, 160));
  } finally {
    reader.close();
  }

  await app.close();
  await redis.quit();
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
# Simultaneous Real-Time Transcription System

Sistema open-source de transcripción y traducción de audio en tiempo real para conferencias. Captura audio (micrófono o archivo), lo procesa por chunks usando VAD (Silero), lo transcribe/traduce con una estrategia pluggable de IA, y transmite los subtítulos a audiencias web y a un overlay transparente para OBS.

> **MVP actual:** 2+ sesiones concurrentes en memoria, WebSockets (ingestión) + Server-Sent Events (broadcast), Redis Pub/Sub para escalar workers.

---

## 1. Arquitectura

```
┌─────────────────────┐         WebSocket /ingest         ┌──────────────────────────────┐
│  Admin (Broadcaster)│ ──── audio chunks (base64/binary) │  API (NestJS)                │
│  /admin/broadcast   │ ────────────────────────────────▶ │  IngestionGateway            │
└─────────────────────┘                                   │      │                       │
                                                          │      ▼                       │
                                                          │  AudioPipelineService        │
                                                          │   ├─ AudioAcousticService    │
                                                          │   │   (ffmpeg → PCM 16k mono)│
                                                          │   └─ SileroVadService        │
                                                          │       (chunks + sequenceId)  │
                                                          │            │                 │
                                                          │            ▼                 │
                                                          │  TranscriptionEngine         │
                                                          │   └─ ITranslationProvider    │
                                                          │       (mock | gemini)        │
                                                          │            │                 │
                                                          │            ▼                 │
                                                          │  RedisSubtitleBroadcaster    │
                                                          │   pub stage:{id}:subtitles   │
                                                          └────────────┬─────────────────┘
                                                                       │ Redis Pub/Sub
                              ┌────────────────────────────────────────┘
                              ▼
                    SseBroadcastService (subscriber por cliente)
                              │
   ┌──────────────────────────┼──────────────────────────┐
   ▼                          ▼                          ▼
 GlobalNavComponent      GlobalNavComponent        (Nav Oculta)
 /stage/:id              /admin/broadcast          /overlay/stage/:id
 Audience view           Broadcaster Panel         OBS overlay
 (SSE + Jitter Buffer    (Mic/File Ingestion)      (SSE + Jitter Buffer,
  ordenado por seqId)                              fondo transparente)
```

### Decisiones clave

- **Monorepo Nx + pnpm**: `apps/api` (NestJS 11), `apps/web` (Angular 22 standalone + signals, sin NgModules), `libs/shared-types` (DTOs/contracts compartidos).
- **Strategy Pattern para IA**: todo provider implementa `ITranslationProvider`. Se cambia vía `AI_PROVIDER=mock|gemini` sin tocar el core.
- **Sequence IDs + Jitter Buffer**: cada chunk VAD recibe un `sequenceId` estrictamente incremental por sesión. Las respuestas de IA llegan a distinta velocidad; el frontend las reordena por `sequenceId` en el jitter buffer antes de renderizar.
- **Memoria**: los buffers de audio se liberan explícitamente (slicing + reassign), los streams de ffmpeg se gestionan con `on('error')`/`on('end')`, y hay graceful shutdown (`OnModuleDestroy`) que vacía sesiones, flushes VAD y cierra Redis.
- **Race conditions**: el gateway serializa los mensajes por conexión (cola por conexión) para que `audio` se procese antes de `end`/`disconnect`; el pipeline serializa la ingesta por sesión.

---

## 2. Stack

| Capa | Tecnología |
|---|---|
| Monorepo | Nx 23 + pnpm |
| Backend | NestJS 11 (TypeScript strict, sin `any`) |
| Frontend | Angular 22 (Standalone Components, Signals, RxJS) |
| Audio | `ffmpeg` (downsample a PCM 16-bit/16kHz/mono) + `@ricky0123/vad-node` (Silero VAD, ONNX) |
| IA | Strategy Pattern: `MockTranslationProvider` (default) y `GeminiTranslationProvider` (`@google/genai` + circuit breaker `opossum`) |
| Mensajería | Redis Pub/Sub (`ioredis`) |
| Transporte | WebSocket (socket.io) para ingestión + SSE para broadcast |
| Infra | `docker-compose.yml` (postgres provisionado para fases futuras, redis, api con ffmpeg, web con nginx) |

---

## 3. Requisitos

- Node.js 22+
- pnpm 9+
- Docker + Docker Compose (para Redis/Postgres y el despliegue)
- `ffmpeg` en el `PATH` para el desarrollo local

```bash
# Linux (Debian/Ubuntu)
sudo apt install ffmpeg
```

---

## 4. Puesta en marcha

### 4.1 Con Docker Compose (todo el sistema)

```bash
cp .env.example .env        # ajustar variables si es necesario
docker compose up --build
```

- API: `http://localhost:3000/api`
- Web: `http://localhost:8080`
- Redis: `localhost:6379`
- Postgres: `localhost:5432` (provisionado, no usado en el MVP)

### 4.2 En desarrollo

```bash
pnpm install

# Redis (necesario para el broadcast)
docker compose up -d redis

# Terminal 1: API
pnpm nx serve api

# Terminal 2: Web (dev server con proxy a la API)
pnpm nx serve web
```

- API: `http://localhost:3000/api`
- Web: `http://localhost:4200`

---

## 5. Cómo probar

### 5.1 A través de la Interfaz (Recomendado)

1. Abre `http://localhost:8080` (si usas Docker) o `http://localhost:4200` (desarrollo local).
2. Usa la **Barra de Navegación Global** superior para ir a `Panel Admin`.
3. En el panel, el ID del escenario por defecto es `demo`. Selecciona el idioma original y el de destino, y pulsa **Conectar**.
4. Sube un archivo de audio (`.mp3` o `.wav`) y haz clic en **Transmitir archivo**, o utiliza **Iniciar micrófono**.
5. Abre una nueva pestaña, navega a la **Vista Audiencia** (`/stage/demo`) o a la **Vista OBS** (`/overlay/stage/demo`) para ver la transcripción y traducción en tiempo real. Utiliza el toggle para alternar entre idiomas.

### 5.2 Con el driver real (Gemini)

```bash
export AI_PROVIDER=gemini
export GEMINI_API_KEY=tu_clave
pnpm nx serve api
```

El pipeline no cambia: el `TranslationProviderFactory` selecciona el provider según `.env`.

### 5.3 Verificar el broadcast sin UI

```bash
# Conecta al SSE del stage
curl -N http://localhost:3000/api/stage/stage-1/subtitles
```

Y publica un payload de prueba en Redis:

```bash
redis-cli publish 'stage:stage-1:subtitles' '{"sessionId":"stage-1","event":"transcription","sequenceId":1,"result":{"sourceText":"hola","translatedText":"hello"},"status":null,"error":null,"serverTimestamp":0}'
```

---

## 6. Estructura del proyecto

```
apps/
  api/                    # NestJS 11
    src/app/
      ai/                 # Strategy Pattern (providers + engine)
      audio/              # ffmpeg + VAD + pipeline config
      broadcast/          # broadcaster Redis + SseBroadcastService
      config/             # config tipada desde env
      gateways/           # IngestionGateway (WS) + SessionController + BroadcastController (SSE)
      pipeline/           # AudioPipelineService (sesiones en memoria)
  api-e2e/                # tests e2e (in-process Nest): WS -> pipeline -> Redis -> SSE
  web/                    # Angular 22 standalone
    src/app/
      broadcast/          # /admin/broadcast (AdminBroadcastComponent)
      stage/              # /stage/:id (StageSubtitlesComponent)
      overlay/            # /overlay/stage/:id (ObsOverlayComponent)
      services/           # ws, sse, audio-capturer, subtitle-store, jitter-buffer
libs/
  shared-types/           # DTOs, interfaces, enums (contracto compartido)
```

---

## 7. Configuración (`.env`)

| Variable | Descripción | Default |
|---|---|---|
| `PORT` | Puerto de la API | `3000` |
| `REDIS_URL` | URL de Redis | `redis://localhost:6379` |
| `AI_PROVIDER` | `mock` \| `gemini` | `mock` |
| `GEMINI_API_KEY` | Clave de Gemini (si `AI_PROVIDER=gemini`) | — |
| `GEMINI_MODEL` | Modelo de Gemini | `gemini-3.8-flash` |
| `MAX_CHUNK_DURATION_MS` | Duración máxima de chunk VAD | `5000` |
| `VAD_SILENCE_THRESHOLD_MS` | Silencio que corta el chunk | `300` |
| `VAD_FAKE` | `true` usa un VAD determinista (tests e2e) | `false` |

---

## 8. Testing

```bash
# Unit tests
pnpm nx test api
pnpm nx test shared-types
pnpm nx test web

# E2E (requiere Redis arriba: docker compose up -d redis)
pnpm nx run api-e2e:e2e
```

- **Unit**: VAD (splitting por silencio/max-duración, sequenceIds, memoria), ffmpeg (transcode real), pipeline (sesiones concurrentes, graceful shutdown), factory IA, jitter buffer (reordenación), subtitle store.
- **E2E** (in-process Nest con VAD fake determinista): `Redis publish → SSE emit` y `WebSocket ingest → pipeline → Redis → SSE`.

---

## 9. Escalado horizontal (hoja de ruta)

El diseño actual escala a **2+ sesiones** con un solo proceso. Para **miles de usuarios concurrentes**:

### 9.1 Múltiples instancias de API + Redis Pub/Sub

- El pipeline de ingestión (VAD/transcode/IA) es por-sesión y no necesita estado compartido: cada sesión vive en una instancia.
- El broadcast ya es stateless vía Redis Pub/Sub: cualquiera puede suscribirse al canal `stage:{id}:subtitles`. Esto ya permite **N réplicas de la API** detrás de un load balancer (sticky por sesión para ingestión, cualquier réplica sirve SSE).

### 9.2 Mercure (reemplazo del fan-out SSE)

El `SseBroadcastService` crea un subscriber Redis **por cliente**. Con miles de audiencia esto satura Redis. **Mercure** resuelve el problema: el publisher publica una vez y Mercure distribuye a todos los suscriptores HTTP/SSE.

```
Ingest API ── Redis Pub/Sub ──▶ Mercure Hub ── SSE ──▶ /stage/:id  (clientes)
                                    │
                            Audiencia (miles)
```

Pasos:
1. Sustituir el loop de `SseBroadcastService` por un `ISubtitleBroadcaster` que publique en Mercure (`mercure_hub_url`).
2. El frontend pasa a usar la URL de Mercure con topic `stage/{id}` vía `EventSource`.
3. El `IngestionGateway` sigue en la API; el broadcast no necesita conocer al receptor.

### 9.3 Backpressure y memoria

- Los chunks VAD ya son finitos (`MAX_CHUNK_DURATION_MS`).
- Para producción: colas por sesión (BullMQ sobre Redis) y `Worker Threads` para el transcode si la CPU es cuello de botella.
- Persistencia (postgres ya provisionado): exportación SRT, glosarios, historial — fase posterior.

---

## 10. Comandos útiles Nx

```bash
pnpm nx graph          # visualiza el grafo de dependencias
pnpm nx build api      # build de la API
pnpm nx build web      # build de la web
pnpm nx run-many --target=test --projects=api,web,shared-types
```

---

## Licencia

MIT — ver [LICENSE](./LICENSE).
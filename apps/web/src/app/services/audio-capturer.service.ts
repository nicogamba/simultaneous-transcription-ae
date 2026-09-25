import { Injectable, signal } from '@angular/core';
import { WsService } from './ws.service';
import { createMicWorklet } from './mic-worklet';
import {
  downmixToMono,
  float32ToInt16,
  MIC_SAMPLE_RATE,
  PCM_MIME_TYPE,
} from './pcm.utils';

export const FILE_CHUNK_BYTES = 48 * 1024;
export const FILE_CHUNK_INTERVAL_MS = 400;
export const MIC_BUFFER_MS = 1500;

@Injectable({ providedIn: 'root' })
export class AudioCapturerService {
  readonly recording = signal(false);
  readonly mimeType = signal<string>('audio/webm');
  readonly fileStreaming = signal(false);
  readonly fileProgress = signal(0);

  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private stream: MediaStream | null = null;
  private fileCancelled = false;

  constructor(private readonly ws: WsService) {}

  async startMic(): Promise<void> {
    if (this.audioContext) {
      return;
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mimeType.set(PCM_MIME_TYPE);

    const context = new AudioContext({ sampleRate: MIC_SAMPLE_RATE });
    await context.resume();
    const source = context.createMediaStreamSource(this.stream);

    const onPcm = (mono: Float32Array): void => {
      const pcm = float32ToInt16(mono);
      void this.sendPcm(pcm);
    };

    try {
      this.workletNode = await createMicWorklet(context, source, onPcm);
    } catch {
      const processor = context.createScriptProcessor(4096, 2, 1);
      processor.onaudioprocess = (event) => {
        const channels: Float32Array[] = [];
        for (let c = 0; c < event.inputBuffer.numberOfChannels; c++) {
          channels.push(event.inputBuffer.getChannelData(c));
        }
        onPcm(downmixToMono(channels));
      };
      source.connect(processor);
      processor.connect(context.destination);
      this.processor = processor;
    }

    this.audioContext = context;
    this.sourceNode = source;
    this.recording.set(true);
  }

  stopMic(): void {
    this.processor?.disconnect();
    this.workletNode?.port.close();
    this.workletNode?.disconnect();
    this.sourceNode?.disconnect();
    void this.audioContext?.close();
    this.audioContext = null;
    this.sourceNode = null;
    this.workletNode = null;
    this.processor = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recording.set(false);
  }

  /**
   * Streams a local audio file to the ingestion socket in small fragments,
   * simulating a real-time stream. Each fragment waits for the server ack
   * before sending the next one (backpressure).
   */
  async streamFile(file: File): Promise<void> {
    this.fileCancelled = false;
    this.fileProgress.set(0);
    this.fileStreaming.set(true);
    this.mimeType.set(file.type || 'audio/mpeg');

    const size = file.size;
    let offset = 0;
    try {
      while (offset < size) {
        if (this.fileCancelled) {
          return;
        }
        const end = Math.min(offset + FILE_CHUNK_BYTES, size);
        const slice = file.slice(offset, end);
        const base64 = await this.readAsBase64(slice);
        await this.ws.sendAudio({
          mimeType: this.mimeType(),
          data: base64,
          clientTimestamp: Date.now(),
        });
        offset = end;
        this.fileProgress.set(Math.round((offset / size) * 100));
        if (offset < size) {
          await delay(FILE_CHUNK_INTERVAL_MS);
        }
      }
      await this.ws.sendEnd();
    } finally {
      this.fileStreaming.set(false);
    }
  }

  stopFileStream(): void {
    this.fileCancelled = true;
  }

  /**
   * Sends a raw 16kHz mono 16-bit PCM buffer (mic capture via Web Audio API).
   * The backend feeds it straight to the VAD, bypassing ffmpeg.
   */
  private async sendPcm(pcm: Uint8Array): Promise<void> {
    try {
      const base64 = await arrayBufferToBase64(pcm.buffer);
      await this.ws.sendAudio({
        mimeType: PCM_MIME_TYPE,
        data: base64,
        clientTimestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to send PCM buffer', error);
    }
  }

  private readAsBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const index = result.indexOf('base64,');
        resolve(index >= 0 ? result.slice(index + 7) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
}

function arrayBufferToBase64(buffer: ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
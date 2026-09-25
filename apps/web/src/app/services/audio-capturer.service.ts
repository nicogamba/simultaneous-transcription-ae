import { Injectable, signal } from '@angular/core';
import { WsService } from './ws.service';
import { extractWebmHeader } from './webm-header.util';

export const FILE_CHUNK_BYTES = 48 * 1024;
export const FILE_CHUNK_INTERVAL_MS = 400;

@Injectable({ providedIn: 'root' })
export class AudioCapturerService {
  readonly recording = signal(false);
  readonly mimeType = signal<string>('audio/webm');
  readonly fileStreaming = signal(false);
  readonly fileProgress = signal(0);

  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private fileCancelled = false;
  private micHeader: Blob | null = null;

  constructor(private readonly ws: WsService) {}

  async startMic(timesliceMs = 1500): Promise<void> {
    if (this.recorder) {
      return;
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = this.pickMimeType();
    this.mimeType.set(mimeType);
    this.micHeader = null;
    this.recorder = new MediaRecorder(
      this.stream,
      mimeType ? { mimeType } : undefined,
    );
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        void this.sendMicBlob(event.data);
      }
    };
    this.recorder.start(timesliceMs);
    this.recording.set(true);
  }

  stopMic(): void {
    this.recorder?.stop();
    this.recorder = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.micHeader = null;
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
 * Sends a MediaRecorder mic blob. Chrome's MediaRecorder only includes the
 * EBML/WebM header in the first chunk; later chunks are bare Clusters that
 * ffmpeg cannot parse alone. We extract the header once and prepend it to
 * every subsequent chunk so each message is an independently decodable WebM.
 */
private async sendMicBlob(blob: Blob): Promise<void> {
  try {
    let payload = blob;
    if (!this.micHeader) {
      const header = await extractWebmHeader(blob);
      if (header) {
        this.micHeader = header;
      }
    } else {
      payload = new Blob([this.micHeader, blob], { type: blob.type });
    }
    const base64 = await this.readAsBase64(payload);
    await this.ws.sendAudio({
      mimeType: this.mimeType(),
      data: base64,
      clientTimestamp: Date.now(),
    });
  } catch (error) {
    console.error('Failed to send mic blob', error);
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

  private pickMimeType(): string {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    return (
      candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
    );
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
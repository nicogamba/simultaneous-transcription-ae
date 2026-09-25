import { Injectable, signal } from '@angular/core';
import { IngestionService } from './ingestion.service';

@Injectable({ providedIn: 'root' })
export class AudioCapturerService {
  readonly recording = signal(false);
  readonly mimeType = signal<string>('audio/webm');

  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;

  constructor(private readonly ingestion: IngestionService) {}

  async startMic(timesliceMs = 1500): Promise<void> {
    if (this.recorder) {
      return;
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = this.pickMimeType();
    this.mimeType.set(mimeType);
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        void this.sendBlob(event.data);
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
    this.recording.set(false);
  }

  async sendFile(file: File): Promise<void> {
    const buffer = await file.arrayBuffer();
    const base64 = await this.blobToBase64(new Blob([buffer]));
    this.mimeType.set(file.type || 'audio/mpeg');
    await this.ingestion.sendAudio(base64, this.mimeType());
  }

  private async sendBlob(blob: Blob): Promise<void> {
    const base64 = await this.blobToBase64(blob);
    await this.ingestion.sendAudio(base64, this.mimeType());
  }

  private blobToBase64(blob: Blob): Promise<string> {
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
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
  }
}
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AudioCapturerService } from '../services/audio-capturer.service';
import { IngestionService } from '../services/ingestion.service';
import {
  SourceLanguage,
  TargetLanguage,
} from '@simultaneous-transcription-ae/shared-types';

@Component({
  selector: 'app-broadcast',
  imports: [CommonModule, FormsModule],
  templateUrl: './broadcast.component.html',
  styleUrl: './broadcast.component.scss',
})
export class BroadcastComponent {
  private readonly capturer = inject(AudioCapturerService);
  private readonly ingestion = inject(IngestionService);

  protected readonly sessionId = signal('stage-1');
  protected readonly sourceLanguage = signal<SourceLanguage>(SourceLanguage.EN);
  protected readonly targetLanguage = signal<TargetLanguage>(TargetLanguage.ES);
  protected readonly fileName = signal<string | null>(null);
  protected readonly message = signal<string>('');
  protected readonly status = signal<'idle' | 'connected' | 'recording'>('idle');

  protected get connected(): boolean {
    return this.ingestion.connected();
  }

  protected connect(): void {
    this.ingestion.connect({
      sessionId: this.sessionId(),
      sourceLanguage: this.sourceLanguage(),
      targetLanguage: this.targetLanguage(),
      mimeType: this.capturer.mimeType(),
    });
    this.status.set(this.ingestion.connected() ? 'connected' : 'idle');
    this.setMessage('Conectado al servidor de ingestión');
  }

  protected async startMic(): Promise<void> {
    try {
      await this.capturer.startMic();
      this.status.set('recording');
      this.setMessage('Grabando micrófono...');
    } catch (error) {
      this.setMessage(`No se pudo acceder al micrófono: ${String(error)}`);
    }
  }

  protected stopMic(): void {
    this.capturer.stopMic();
    this.status.set('connected');
    this.setMessage('Grabación detenida');
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.fileName.set(file.name);
      this.setMessage(`Archivo seleccionado: ${file.name}`);
    }
  }

  protected async sendFile(): Promise<void> {
    const input = document.querySelector<HTMLInputElement>('#file-input');
    const file = input?.files?.[0];
    if (!file) {
      this.setMessage('Selecciona un archivo primero');
      return;
    }
    try {
      await this.capturer.sendFile(file);
      this.setMessage(`Enviado: ${file.name}`);
    } catch (error) {
      this.setMessage(`Error al enviar archivo: ${String(error)}`);
    }
  }

  protected async endSession(): Promise<void> {
    try {
      this.capturer.stopMic();
      await this.ingestion.sendEnd();
      this.ingestion.disconnect();
      this.status.set('idle');
      this.setMessage('Sesión finalizada');
    } catch (error) {
      this.setMessage(`Error al finalizar: ${String(error)}`);
    }
  }

  private setMessage(text: string): void {
    this.message.set(text);
  }
}
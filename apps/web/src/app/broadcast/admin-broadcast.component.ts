import {
  Component,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AudioCapturerService } from '../services/audio-capturer.service';
import { WsService } from '../services/ws.service';
import {
  SourceLanguage,
  TargetLanguage,
} from '@simultaneous-transcription-ae/shared-types';

type Phase = 'idle' | 'mic' | 'file';

@Component({
  selector: 'app-admin-broadcast',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-broadcast.component.html',
  styleUrl: './admin-broadcast.component.scss',
})
export class AdminBroadcastComponent implements OnDestroy {
  protected readonly capturer = inject(AudioCapturerService);
  protected readonly ws = inject(WsService);

  protected readonly sessionId = signal('demo');
  protected readonly sourceLanguage = signal<SourceLanguage>(SourceLanguage.ES);
  protected readonly targetLanguage = signal<TargetLanguage>(TargetLanguage.EN);
  protected readonly fileName = signal<string | null>(null);
  protected readonly message = signal<string>('');
  protected readonly phase = signal<Phase>('idle');

  ngOnDestroy(): void {
    this.capturer.stopMic();
    this.capturer.stopFileStream();
    if (this.ws.status() !== 'disconnected') {
      void this.ws.sendEnd().catch(() => undefined);
    }
    this.ws.disconnect();
  }

  protected connect(): void {
    this.ws.connect({
      sessionId: this.sessionId(),
      sourceLanguage: this.sourceLanguage(),
      targetLanguage: this.targetLanguage(),
      mimeType: this.capturer.mimeType(),
    });
    this.setMessage('Conectando al servidor de ingestión…');
  }

  protected async startMic(): Promise<void> {
    try {
      await this.capturer.startMic();
      this.phase.set('mic');
      this.setMessage('Grabando micrófono…');
    } catch (error) {
      this.setMessage(`No se pudo acceder al micrófono: ${String(error)}`);
    }
  }

  protected stopMic(): void {
    this.capturer.stopMic();
    this.phase.set('idle');
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

  protected async streamFile(): Promise<void> {
    const input = document.querySelector<HTMLInputElement>('#file-input');
    const file = input?.files?.[0];
    if (!file) {
      this.setMessage('Selecciona un archivo primero');
      return;
    }
    try {
      this.phase.set('file');
      this.setMessage(`Transmitiendo ${file.name}…`);
      await this.capturer.streamFile(file);
      if (this.capturer.fileProgress() >= 100) {
        this.setMessage(`Enviado: ${file.name}`);
      } else {
        this.setMessage('Transmisión cancelada');
      }
    } catch (error) {
      this.setMessage(`Error al transmitir: ${String(error)}`);
    } finally {
      this.phase.set('idle');
    }
  }

  protected stopFileStream(): void {
    this.capturer.stopFileStream();
  }

  protected async endSession(): Promise<void> {
    try {
      this.capturer.stopMic();
      this.capturer.stopFileStream();
      await this.ws.sendEnd();
      this.ws.disconnect();
      this.phase.set('idle');
      this.setMessage('Sesión finalizada');
    } catch (error) {
      this.setMessage(`Error al finalizar: ${String(error)}`);
    }
  }

  private setMessage(text: string): void {
    this.message.set(text);
  }
}
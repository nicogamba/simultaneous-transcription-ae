import { Injectable, Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough, Readable } from 'node:stream';

@Injectable()
export class AudioAcousticService {
  private readonly logger = new Logger(AudioAcousticService.name);

  transcodeToPcm16kMono(input: Uint8Array, mimeType: string): Promise<Uint8Array> {
    if (input.byteLength === 0) {
      return Promise.resolve(new Uint8Array(0));
    }

    const chunks: Uint8Array[] = [];
    const stdout = new PassThrough();
    stdout.on('data', (chunk: Buffer) => chunks.push(new Uint8Array(chunk)));

    return new Promise<Uint8Array>((resolve, reject) => {
      let stdoutEnded = false;
      let commandEnded = false;

      const finalize = () => {
        if (!stdoutEnded || !commandEnded) {
          return;
        }
        const size = chunks.reduce((acc, c) => acc + c.byteLength, 0);
        const merged = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }
        chunks.length = 0;
        this.logger.debug(
          `Transcoded ${input.byteLength} bytes of ${mimeType} to PCM 16k mono (${size} bytes)`,
        );
        resolve(merged);
      };

      stdout.on('error', (error) => reject(error));
      stdout.on('end', () => {
        stdoutEnded = true;
        finalize();
      });

      const format = this.inputFormatFor(mimeType);
      const command = ffmpeg(Readable.from(Buffer.from(input)))
        .audioFrequency(16000)
        .audioChannels(1)
        .audioCodec('pcm_s16le')
        .format('s16le')
        .on('error', (error: Error) => {
          stdout.destroy();
          reject(error);
        })
        .on('end', () => {
          commandEnded = true;
          finalize();
        });

      if (format) {
        command.inputFormat(format);
      }
      command.pipe(stdout, { end: true });
    });
  }

  private inputFormatFor(mimeType: string): string {
    const base = mimeType.split(';')[0].trim().toLowerCase();
    switch (base) {
      case 'audio/mpeg':
      case 'audio/mp3':
        return 'mp3';
      case 'audio/wav':
      case 'audio/wave':
      case 'audio/x-wav':
        return 'wav';
      case 'audio/webm':
        return 'webm';
      case 'audio/ogg':
        return 'ogg';
      default:
        return '';
    }
  }
}
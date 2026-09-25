import { Injectable, Logger } from '@nestjs/common';
import { NonRealTimeVAD } from '@ricky0123/vad-node';
import { IVadProcessor, VadSegment } from './vad.processor';

@Injectable()
export class SileroVadProcessor implements IVadProcessor {
  private readonly logger = new Logger(SileroVadProcessor.name);
  private vad: NonRealTimeVAD | null = null;
  private initPromise: Promise<NonRealTimeVAD> | null = null;

  async run(audio: Float32Array, sampleRate: number): Promise<VadSegment[]> {
    const vad = await this.getVad();
    const segments: VadSegment[] = [];
    for await (const segment of vad.run(audio, sampleRate)) {
      segments.push({ start: segment.start, end: segment.end });
    }
    return segments;
  }

  async dispose(): Promise<void> {
    this.initPromise = null;
    this.vad = null;
  }

  private getVad(): Promise<NonRealTimeVAD> {
    if (this.vad) {
      return Promise.resolve(this.vad);
    }
    if (!this.initPromise) {
      this.logger.log('Initializing Silero VAD (ONNX)...');
      this.initPromise = NonRealTimeVAD.new({})
        .then((vad) => {
          this.vad = vad;
          this.logger.log('Silero VAD ready.');
          return vad;
        })
        .catch((error: unknown) => {
          this.initPromise = null;
          this.logger.error('Failed to initialize Silero VAD', error);
          throw error;
        });
    }
    return this.initPromise;
  }
}
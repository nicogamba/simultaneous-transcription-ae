import { Injectable } from '@nestjs/common';
import { IVadProcessor, VadSegment } from './vad.processor';

@Injectable()
export class FakeVadProcessor implements IVadProcessor {
  async run(audio: Float32Array, _sampleRate: number): Promise<VadSegment[]> {
    if (audio.length === 0) {
      return [];
    }
    return [{ start: 0, end: audio.length }];
  }

  async dispose(): Promise<void> {
    return undefined;
  }
}
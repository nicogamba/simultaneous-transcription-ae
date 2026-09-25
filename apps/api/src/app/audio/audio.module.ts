import { Module } from '@nestjs/common';
import { AudioAcousticService } from './audio-acoustic.service';
import { FakeVadProcessor } from './fake-vad.processor';
import { pipelineConfigFromEnv, PIPELINE_CONFIG } from './pipeline.config';
import { SileroVadProcessor } from './silero-vad.processor';
import { SileroVadService } from './silero-vad.service';
import { VAD_PROCESSOR } from './vad.processor';

@Module({
  providers: [
    AudioAcousticService,
    SileroVadService,
    {
      provide: VAD_PROCESSOR,
      useFactory: () =>
        process.env['VAD_FAKE'] === 'true'
          ? new FakeVadProcessor()
          : new SileroVadProcessor(),
    },
    {
      provide: PIPELINE_CONFIG,
      useFactory: () => pipelineConfigFromEnv(process.env),
    },
  ],
  exports: [AudioAcousticService, SileroVadService],
})
export class AudioModule {}
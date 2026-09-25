import { Module } from '@nestjs/common';
import { AudioAcousticService } from './audio-acoustic.service';
import { pipelineConfigFromEnv, PIPELINE_CONFIG } from './pipeline.config';
import { SileroVadProcessor } from './silero-vad.processor';
import { SileroVadService } from './silero-vad.service';
import { VAD_PROCESSOR } from './vad.processor';

@Module({
  providers: [
    AudioAcousticService,
    SileroVadService,
    { provide: VAD_PROCESSOR, useClass: SileroVadProcessor },
    {
      provide: PIPELINE_CONFIG,
      useFactory: () => pipelineConfigFromEnv(process.env),
    },
  ],
  exports: [AudioAcousticService, SileroVadService],
})
export class AudioModule {}
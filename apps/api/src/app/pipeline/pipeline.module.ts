import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AudioModule } from '../audio/audio.module';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { AudioPipelineService } from './audio-pipeline.service';

@Module({
  imports: [AudioModule, AiModule, BroadcastModule],
  providers: [AudioPipelineService],
  exports: [AudioPipelineService],
})
export class PipelineModule {}
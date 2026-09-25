import { Module } from '@nestjs/common';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { BroadcastController } from './broadcast.controller';
import { IngestionGateway } from './ingestion.gateway';
import { SessionController } from './session.controller';
import { PipelineModule } from '../pipeline/pipeline.module';
import { SseBroadcastService } from '../broadcast/sse-broadcast.service';

@Module({
  imports: [PipelineModule, BroadcastModule],
  controllers: [BroadcastController, SessionController],
  providers: [IngestionGateway, SseBroadcastService],
})
export class GatewayModule {}
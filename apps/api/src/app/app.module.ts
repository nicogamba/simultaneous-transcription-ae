import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { GatewayModule } from './gateways/gateway.module';
import { PipelineModule } from './pipeline/pipeline.module';

@Module({
  imports: [ConfigModule, PipelineModule, GatewayModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
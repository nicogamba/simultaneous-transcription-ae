import { Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/app.config';
import {
  RedisSubtitleBroadcaster,
  REDIS_URL,
} from './redis-subtitle-broadcaster';
import { SUBTITLE_BROADCASTER } from './subtitle-broadcaster.interface';

@Module({
  providers: [
    {
      provide: REDIS_URL,
      useFactory: (config: AppConfig) => config.redisUrl,
      inject: [APP_CONFIG],
    },
    {
      provide: SUBTITLE_BROADCASTER,
      useClass: RedisSubtitleBroadcaster,
    },
  ],
  exports: [SUBTITLE_BROADCASTER],
})
export class BroadcastModule {}
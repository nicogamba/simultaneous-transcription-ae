import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Observable } from 'rxjs';
import Redis from 'ioredis';
import { REDIS_URL } from './redis-subtitle-broadcaster';
import { stageChannel } from './subtitle-broadcaster.interface';

@Injectable()
export class SseBroadcastService implements OnModuleDestroy {
  private readonly logger = new Logger(SseBroadcastService.name);
  private readonly subscribers = new Set<Redis>();

  constructor(@Inject(REDIS_URL) private readonly redisUrl: string) {}

  streamFor(sessionId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const client = new Redis(this.redisUrl, {
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
      });
      this.subscribers.add(client);

      const channel = stageChannel(sessionId);
      const onError = (error: Error) => {
        this.logger.error(`SSE subscriber error on ${channel}: ${error.message}`);
        subscriber.error(error);
      };
      const onMessage = (_chan: string, message: string) => {
        subscriber.next({ data: message } as MessageEvent);
      };

      client.on('error', onError);
      client.on('message', onMessage);
      void client.subscribe(channel);

      return () => {
        client.off('error', onError);
        client.off('message', onMessage);
        this.subscribers.delete(client);
        void client
          .unsubscribe(channel)
          .then(() => client.quit())
          .catch(() => client.disconnect());
      };
    });
  }

  async onModuleDestroy(): Promise<void> {
    for (const client of this.subscribers) {
      client.disconnect();
    }
    this.subscribers.clear();
  }
}
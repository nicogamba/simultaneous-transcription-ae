import { Controller, Param, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { SseBroadcastService } from '../broadcast/sse-broadcast.service';

@Controller('stage')
export class BroadcastController {
  constructor(private readonly sse: SseBroadcastService) {}

  @Sse(':id/subtitles')
  subtitles(@Param('id') id: string): Observable<MessageEvent> {
    return this.sse.streamFor(id);
  }
}
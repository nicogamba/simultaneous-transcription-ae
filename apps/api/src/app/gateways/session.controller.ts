import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import type {
  CreateSessionDto,
  SessionStatus,
} from '@simultaneous-transcription-ae/shared-types';
import { AudioPipelineService } from '../pipeline/audio-pipeline.service';

@Controller('sessions')
export class SessionController {
  constructor(private readonly pipeline: AudioPipelineService) {}

  @Post()
  register(@Body() dto: CreateSessionDto): CreateSessionDto {
    this.pipeline.registerSession(dto);
    return dto;
  }

  @Get(':id')
  status(@Param('id') id: string): { sessionId: string; status: SessionStatus | null } {
    return { sessionId: id, status: this.pipeline.getStatus(id) };
  }

  @Delete(':id')
  @HttpCode(204)
  async end(@Param('id') id: string): Promise<void> {
    await this.pipeline.endSession(id);
  }
}
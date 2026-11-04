import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from '../auth/decorators/public.decorator.js';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status: string;

  @ApiProperty({ example: 'up' })
  database: string;
}

/** For Docker HEALTHCHECK, the load balancer and uptime monitors. Reveals nothing else. */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Liveness and database connectivity' })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiServiceUnavailableResponse({
    description: 'The database is unreachable.',
  })
  async check(): Promise<HealthResponseDto> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
      });
    }

    return { status: 'ok', database: 'up' };
  }
}

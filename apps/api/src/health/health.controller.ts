import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness + readiness probe (Railway/K8s)' })
  async check() {
    let db = 'down';
    let latencyMs = -1;
    const t0 = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
      latencyMs = Date.now() - t0;
    } catch {
      db = 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
      db,
      dbLatencyMs: latencyMs,
      version: process.env.npm_package_version ?? '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }
}

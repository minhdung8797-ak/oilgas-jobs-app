import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response } from 'express';
import { Observable, tap } from 'rxjs';

export const CACHE_TTL_KEY = 'cache_ttl_seconds';
/** Đặt Cache-Control cho endpoint: @CacheTTL(60) */
export const CacheTTL = (seconds: number) => SetMetadata(CACHE_TTL_KEY, seconds);

/**
 * Không cache trong RAM (API chạy nhiều replica) mà đẩy cache ra tầng CDN/browser
 * bằng header. stale-while-revalidate giúp p95 rất thấp cho trang danh sách.
 */
@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ttl = this.reflector.get<number>(CACHE_TTL_KEY, ctx.getHandler());
    const res = ctx.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      tap(() => {
        if (ttl && !res.headersSent) {
          res.setHeader(
            'Cache-Control',
            `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${ttl * 5}`,
          );
        }
      }),
    );
  }
}

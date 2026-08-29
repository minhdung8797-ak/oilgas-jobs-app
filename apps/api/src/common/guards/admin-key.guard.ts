import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Bảo vệ các endpoint quản trị (/scrape/run, /classify/rebuild).
 * Header: Authorization: Bearer <ADMIN_API_KEY>  hoặc  x-api-key: <ADMIN_API_KEY>
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.config.get<string>('adminApiKey');
    if (!expected) {
      throw new UnauthorizedException('ADMIN_API_KEY chưa được cấu hình trên server');
    }
    const req = ctx.switchToHttp().getRequest<Request>();
    // Bỏ tiền tố "Bearer " lặp lại: giao diện Swagger tự thêm một lần, người dùng
    // hay gõ thêm một lần nữa -> "Bearer Bearer <key>". Cắt hết rồi trim, vì giá
    // trị copy từ bảng điều khiển Render thường dính khoảng trắng/xuống dòng.
    const bearer = (req.headers.authorization ?? '').replace(/^(?:Bearer\s+)+/i, '').trim();
    const apiKey = ((req.headers['x-api-key'] as string) ?? '').trim();
    const provided = bearer || apiKey;
    if (!provided || provided !== expected.trim()) {
      throw new UnauthorizedException('API key không hợp lệ');
    }
    return true;
  }
}

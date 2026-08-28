import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const logger = new Logger('Bootstrap');

  // PORT do nền tảng (Render/Railway) cấp phải được ưu tiên tuyệt đối:
  // bind sai cổng = "no open ports detected" = deploy fail.
  // API_PORT chỉ dùng khi chạy local/docker-compose.
  const port = parseInt(process.env.PORT ?? process.env.API_PORT ?? '4000', 10);
  const prefix = process.env.API_PREFIX ?? 'api/v1';
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim());

  app.setGlobalPrefix(prefix);

  // Railway/Vercel/Nginx đứng trước app -> nếu không bật trust proxy thì mọi
  // request đều mang IP của proxy, rate limit sẽ chặn nhầm toàn bộ người dùng.
  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  app.enableCors({
    origin: origins.includes('*') ? true : origins,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: false,
    maxAge: 86400,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Swagger: tài liệu API tương tác tại /api/v1/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('OilGas Jobs API')
    .setDescription(
      'API tổng hợp job dầu khí quốc tế thuộc 4 nhóm: Reservoir, Petroleum, Production, Geoscience & Formation.',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'admin')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${prefix}/docs`, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const prisma = app.get(PrismaService);
  prisma.enableShutdownHooks(app);
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
  logger.log(`API sẵn sàng tại http://localhost:${port}/${prefix}`);
  logger.log(`Swagger: http://localhost:${port}/${prefix}/docs`);
}

void bootstrap();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 安全中间件
  app.use(helmet());
  app.use(compression());

  // CORS配置 - 使用白名单
  const isProduction = process.env.NODE_ENV === 'production';
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',')
    : isProduction
      ? [] // 生产环境必须配置白名单
      : ['http://localhost:3000', 'http://localhost:8080']; // 开发环境默认值

  app.enableCors({
    origin: (origin, callback) => {
      // 允许无origin的请求（如移动端APP、curl等）
      if (!origin) {
        return callback(null, true);
      }
      
      // 检查是否在白名单中
      if (allowedOrigins.includes(origin) || allowedOrigins.length === 0 && !isProduction) {
        callback(null, true);
      } else {
        callback(new Error(`CORS策略拒绝访问: ${origin}`), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // 全局验证管道
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));

  // 全局异常过滤器
  app.useGlobalFilters(new HttpExceptionFilter());

  // API前缀
  app.setGlobalPrefix('api/v1');

  // Swagger文档
  const config = new DocumentBuilder()
    .setTitle('保研信息助手 API')
    .setDescription('保研信息助手小程序后端API文档')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  console.log(`🚀 服务器运行在: http://localhost:${port}`);
  console.log(`📚 API文档: http://localhost:${port}/api/docs`);
}

bootstrap();

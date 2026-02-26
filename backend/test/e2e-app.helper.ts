import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * 统一配置 e2e 测试应用，保持与 main.ts 行为一致
 */
export async function createConfiguredE2EApp(
  moduleFixture: TestingModule,
): Promise<INestApplication> {
  const app = moduleFixture.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.setGlobalPrefix('api/v1');

  await app.init();
  return app;
}

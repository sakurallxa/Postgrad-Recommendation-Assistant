import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UniversityModule } from './modules/university/university.module';
import { CampModule } from './modules/camp/camp.module';
import { ReminderModule } from './modules/reminder/reminder.module';
import { CrawlerModule } from './modules/crawler/crawler.module';
import { UserModule } from './modules/user/user.module';
import { ProgressModule } from './modules/progress/progress.module';
import { AssistantModule } from './modules/assistant/assistant.module';
import { CommonModule } from './common/common.module';
import { RateLimitMiddleware } from './common/middleware/rate-limit.middleware';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // 测试环境禁用定时任务，避免Jest句柄泄漏
    ...(process.env.NODE_ENV === 'test' ? [] : [ScheduleModule.forRoot()]),

    // 数据库模块
    PrismaModule,

    // 通用模块
    CommonModule,

    // 业务模块
    AuthModule,
    UniversityModule,
    CampModule,
    ReminderModule,
    CrawlerModule,
    UserModule,
    ProgressModule,
    AssistantModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware, RateLimitMiddleware)
      .forRoutes('*');
  }
}

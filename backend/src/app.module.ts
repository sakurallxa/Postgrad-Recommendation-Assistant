import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UniversityModule } from './modules/university/university.module';
import { CampModule } from './modules/camp/camp.module';
import { ReminderModule } from './modules/reminder/reminder.module';
import { CrawlerModule } from './modules/crawler/crawler.module';

@Module({
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    
    // 定时任务模块
    ScheduleModule.forRoot(),
    
    // 数据库模块
    PrismaModule,
    
    // 业务模块
    AuthModule,
    UniversityModule,
    CampModule,
    ReminderModule,
    CrawlerModule,
  ],
})
export class AppModule {}

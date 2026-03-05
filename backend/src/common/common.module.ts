import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RedisService } from './services/redis.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OpenidCryptoService } from './services/openid-crypto.service';
import { DeepSeekService } from './services/deepseek.service';

/**
 * 通用模块
 * 提供全局可用的通用服务
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '7d') as `${number}${'s' | 'm' | 'h' | 'd'}`,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [RedisService, JwtAuthGuard, OpenidCryptoService, DeepSeekService],
  exports: [RedisService, JwtAuthGuard, JwtModule, OpenidCryptoService, DeepSeekService],
})
export class CommonModule {}

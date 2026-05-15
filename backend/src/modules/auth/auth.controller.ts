import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { WxLoginDto } from './dto/wx-login.dto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  @Post('wx-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '微信登录' })
  async wxLogin(@Body() dto: WxLoginDto) {
    return this.authService.wxLogin(dto.code);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '刷新Token' })
  async refreshToken(@Headers('authorization') auth: string) {
    const token = auth?.replace('Bearer ', '');
    return this.authService.refreshToken(token);
  }

  /**
   * v0.2 开发用：mock 登录（直接生成 JWT，不走微信）
   * 仅在 NODE_ENV !== 'production' 可用
   */
  @Post('dev-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '【仅开发】mock 登录' })
  async devLogin(@Body() body: { openid?: string }) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('dev-login 仅本地开发可用');
    }
    const openid = body.openid || 'dev-mock-user';
    // 查找或创建 dev 用户
    let user = await this.prisma.user.findFirst({
      where: { openid },
    });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          openid,
          openidHash: `dev-hash-${openid}`,
          openidCipher: `dev-cipher-${openid}`,
        },
      });
    }
    const accessToken = this.jwtService.sign(
      { sub: user.id, openid: user.openid },
      {
        secret: this.configService.get<string>('JWT_SECRET') || 'dev-secret',
        expiresIn: '30d',
      },
    );
    const refreshToken = this.jwtService.sign(
      { sub: user.id, type: 'refresh' },
      {
        secret: this.configService.get<string>('JWT_SECRET') || 'dev-secret',
        expiresIn: '60d',
      },
    );
    return {
      user: { id: user.id },
      accessToken,
      refreshToken,
      expiresIn: 30 * 24 * 3600,
    };
  }
}

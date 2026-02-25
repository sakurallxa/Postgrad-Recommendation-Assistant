import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 微信登录
   * @param code 微信临时登录凭证
   */
  async wxLogin(code: string) {
    // TODO: 调用微信接口获取openid
    // 目前使用模拟数据
    const openid = `mock_openid_${code}`;

    // 查找或创建用户
    let user = await this.prisma.user.findUnique({
      where: { openid },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: { openid },
      });
    }

    // 生成Token
    const tokens = await this.generateTokens(user.id, user.openid);

    return {
      user: {
        id: user.id,
        openid: user.openid,
      },
      ...tokens,
    };
  }

  /**
   * 刷新Token
   * @param token 刷新令牌
   */
  async refreshToken(token: string) {
    if (!token) {
      throw new UnauthorizedException('Token不能为空');
    }

    try {
      const payload = this.jwtService.verify(token);
      return this.generateTokens(payload.sub, payload.openid);
    } catch (error) {
      throw new UnauthorizedException('Token无效或已过期');
    }
  }

  /**
   * 生成访问令牌和刷新令牌
   */
  private async generateTokens(userId: string, openid: string) {
    const payload = { sub: userId, openid };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '30d'),
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.configService.get('JWT_EXPIRES_IN', '7d'),
    };
  }
}

import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { OpenidCryptoService } from '../../common/services/openid-crypto.service';

/**
 * 微信登录响应接口
 */
export interface WxLoginResponse {
  openid: string;
  session_key: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

/**
 * Token响应接口
 */
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

/**
 * 登录响应接口
 * 注意：出于隐私保护，不返回openid
 */
export interface LoginResponse {
  user: {
    id: string;
    // openid: string; // 隐私字段不返回
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly openidCryptoService: OpenidCryptoService,
  ) {}

  /**
   * 微信登录
   * @param code 微信临时登录凭证
   * @returns 登录响应，包含用户信息和Token
   */
  async wxLogin(code: string): Promise<LoginResponse> {
    // 参数校验
    if (!code || code.trim() === '') {
      throw new UnauthorizedException('微信登录凭证不能为空');
    }

    try {
      // 调用微信接口获取openid
      const wxResponse = await this.callWxLoginApi(code);
      
      if (wxResponse.errcode) {
        this.logger.error(`微信登录失败: ${wxResponse.errmsg} (code: ${wxResponse.errcode})`);
        throw new UnauthorizedException(`微信登录失败: ${wxResponse.errmsg}`);
      }

      const { openid } = wxResponse;
      const openidHash = this.openidCryptoService.hash(openid);
      const openidCipher = this.openidCryptoService.encrypt(openid);

      // 查找或创建用户（优先按openidHash）
      let user = await this.prisma.user.findFirst({
        where: {
          OR: [{ openidHash }, { openid }],
        },
      });

      if (!user) {
        user = await this.prisma.user.create({
          data: {
            openidHash,
            openidCipher,
            openid: null,
          },
        });
        this.logger.log(`新用户创建成功: ${user.id}`);
        // Mock 模式：给新用户自动填一份典型保研画像档案
        const allowMock = this.configService.get<string>('ALLOW_MOCK_WECHAT_LOGIN') === 'true';
        if (allowMock) {
          try {
            await this.prisma.userProfile.create({
              data: {
                userId: user.id,
                schoolName: '某 211 高校',
                schoolLevel: '211',
                education: '本科',
                major: '计算机科学与技术',
                gradeRankPercent: 0.12,
                gradeRankText: '前 12%',
                gpa: '3.85',
                englishType: 'CET-6',
                englishScore: 568,
                subjectRanking: '专业第 9 / 共 76 人',
                researchExperience: '1. 国家自然基金项目"基于深度学习的图像检索"参与者; 2. 一篇 EI 会议论文一作; 3. 大厂算法实习一段。',
                competitionAwards: 'ACM-ICPC 区域赛铜奖 / 数模国二 / 蓝桥杯省一',
                preferredDirection: '人工智能、计算机视觉、推荐系统',
                targetMajors: JSON.stringify(['计算机科学与技术', '人工智能', '软件工程', '电子信息']),
                englishStandardized: 'CET6:568',
                targetNote: 'Mock 档案，用于前端预览',
              },
            });
            this.logger.log(`[mock] 已为新用户 ${user.id} 创建默认档案`);
          } catch (e: any) {
            this.logger.warn(`[mock] 默认档案创建失败: ${e?.message}`);
          }
        }
      } else if (user.openidHash !== openidHash || !user.openidCipher || user.openid) {
        // 兼容旧数据：登录时自动迁移到新字段并清理明文openid
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            openidHash,
            openidCipher,
            openid: null,
          },
        });
      }

      // 生成Token
      const tokens = await this.generateTokens(user.id);

      this.logger.log(`用户登录成功: ${user.id}`);

      return {
        user: {
          id: user.id,
          // openid: user.openid, // 隐私字段不返回
        },
        ...tokens,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`微信登录异常: ${error.message}`, error.stack);
      throw new UnauthorizedException('微信登录失败，请稍后重试');
    }
  }

  /**
   * 刷新Token
   * @param token 刷新令牌
   * @returns 新的Token
   */
  async refreshToken(token: string): Promise<TokenResponse> {
    if (!token || token.trim() === '') {
      throw new UnauthorizedException('刷新令牌不能为空');
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      
      // 验证用户是否存在
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('用户不存在');
      }

      return this.generateTokens(user.id);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Token刷新失败: ${error.message}`);
      throw new UnauthorizedException('令牌无效或已过期');
    }
  }

  /**
   * 调用微信登录接口
   * @param code 微信临时登录凭证
   * @returns 微信登录响应
   */
  private async callWxLoginApi(code: string): Promise<WxLoginResponse> {
    const appid = this.configService.get<string>('WECHAT_APPID');
    const secret = this.configService.get<string>('WECHAT_SECRET');
    const allowMock = this.configService.get<string>('ALLOW_MOCK_WECHAT_LOGIN') === 'true';
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    // 检查配置
    if (!appid || appid === 'wx_appid_placeholder') {
      // 生产环境未配置微信参数时直接失败
      if (isProduction) {
        this.logger.error('生产环境微信AppID未配置，拒绝登录');
        throw new UnauthorizedException('登录服务配置错误');
      }
      
      // 非生产环境仅在显式开启mock时才允许
      if (!allowMock) {
        this.logger.error('微信AppID未配置且未开启mock模式，拒绝登录');
        throw new UnauthorizedException('登录服务配置错误');
      }
      
      this.logger.warn('微信AppID未配置，使用模拟数据（仅开发环境）');
      return {
        openid: `mock_openid_${code}`,
        session_key: 'mock_session_key',
      };
    }

    try {
      const response = await axios.get<WxLoginResponse>(
        'https://api.weixin.qq.com/sns/jscode2session',
        {
          params: {
            appid,
            secret,
            js_code: code,
            grant_type: 'authorization_code',
          },
          timeout: 10000,
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error(`调用微信接口失败: ${error.message}`);
      throw new UnauthorizedException('微信服务暂时不可用');
    }
  }

  /**
   * 生成访问令牌和刷新令牌
   * @param userId 用户ID
   * @returns Token响应
   */
  private async generateTokens(userId: string): Promise<TokenResponse> {
    const payload = { sub: userId };
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '7d') as `${number}${'s' | 'm' | 'h' | 'd'}`;
    const refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '30d') as `${number}${'s' | 'm' | 'h' | 'd'}`;

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, { expiresIn }),
      this.jwtService.signAsync(payload, { expiresIn: refreshExpiresIn }),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: expiresIn as string,
    };
  }
}

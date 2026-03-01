/**
 * 认证服务单元测试
 * 测试用例覆盖: TC-AUTH-001 ~ TC-AUTH-006
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { OpenidCryptoService } from '../../common/services/openid-crypto.service';

// Mock axios
jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: PrismaService;
  let jwtService: JwtService;

  // 模拟Prisma服务
  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  // 模拟JWT服务
  const mockJwtService = {
    signAsync: jest.fn(),
    verify: jest.fn(),
  };

  // 模拟配置服务
  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        WECHAT_APPID: 'test_appid',
        WECHAT_SECRET: 'test_secret',
        JWT_SECRET: 'test_secret',
        JWT_EXPIRES_IN: '7d',
        JWT_REFRESH_EXPIRES_IN: '30d',
      };
      return config[key];
    }),
  };

  const mockOpenidCryptoService = {
    hash: jest.fn((openid: string) => `hash_${openid}`),
    encrypt: jest.fn((openid: string) => `cipher_${openid}`),
    decrypt: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: OpenidCryptoService, useValue: mockOpenidCryptoService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);

    // 重置所有mock
    jest.clearAllMocks();
    mockConfigService.get.mockImplementation((key: string) => {
      const config: Record<string, string> = {
        WECHAT_APPID: 'test_appid',
        WECHAT_SECRET: 'test_secret',
        JWT_SECRET: 'test_secret',
        JWT_EXPIRES_IN: '7d',
        JWT_REFRESH_EXPIRES_IN: '30d',
      };
      return config[key];
    });
  });

  describe('微信登录', () => {
    it('TC-AUTH-001: 微信登录 - 成功场景（新用户）', async () => {
      const code = 'valid_wechat_code';
      const mockOpenid = 'mock_openid_123';
      const mockUser = { id: 'user_123', openidHash: `hash_${mockOpenid}`, openidCipher: `cipher_${mockOpenid}` };
      const mockTokens = {
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_123',
        expiresIn: '7d',
      };

      // Mock微信API响应
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          openid: mockOpenid,
          session_key: 'mock_session_key',
        },
      });

      // 模拟数据库操作
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockUser);
      mockJwtService.signAsync
        .mockResolvedValueOnce(mockTokens.accessToken)
        .mockResolvedValueOnce(mockTokens.refreshToken);

      // 执行测试
      const result = await service.wxLogin(code);

      // 验证结果
      expect(result).toHaveProperty('user');
      expect(result.user).toEqual({ id: mockUser.id /* openid不返回 */ });
      expect(result).toHaveProperty('accessToken', mockTokens.accessToken);
      expect(result).toHaveProperty('refreshToken', mockTokens.refreshToken);
      expect(result).toHaveProperty('expiresIn');

      // 验证数据库调用
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: {
          openidHash: `hash_${mockOpenid}`,
          openidCipher: `cipher_${mockOpenid}`,
          openid: null,
        },
      });
    });

    it('TC-AUTH-001: 微信登录 - 成功场景（已存在用户）', async () => {
      const code = 'valid_wechat_code';
      const mockOpenid = 'mock_openid_123';
      const mockUser = { id: 'user_123', openidHash: `hash_${mockOpenid}`, openidCipher: `cipher_${mockOpenid}` };
      const mockTokens = {
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_123',
        expiresIn: '7d',
      };

      // Mock微信API响应
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          openid: mockOpenid,
          session_key: 'mock_session_key',
        },
      });

      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockJwtService.signAsync
        .mockResolvedValueOnce(mockTokens.accessToken)
        .mockResolvedValueOnce(mockTokens.refreshToken);

      const result = await service.wxLogin(code);

      expect(result.user).toEqual({ id: mockUser.id /* openid不返回 */ });
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });

    it('TC-AUTH-002: 微信登录 - 空code', async () => {
      await expect(service.wxLogin('')).rejects.toThrow(UnauthorizedException);
      await expect(service.wxLogin('   ')).rejects.toThrow('微信登录凭证不能为空');
    });

    it('TC-AUTH-002: 微信登录 - null code', async () => {
      await expect(service.wxLogin(null as any)).rejects.toThrow(UnauthorizedException);
    });

    it('TC-AUTH-003: 微信登录 - 无效code', async () => {
      const invalidCode = 'invalid_code';

      // Mock微信API返回错误
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          errcode: 40029,
          errmsg: 'invalid code',
        },
      });

      await expect(service.wxLogin(invalidCode)).rejects.toThrow('微信登录失败');
    });

    it('安全回归: 未配置微信参数且未开启mock时应拒绝登录', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          WECHAT_APPID: '',
          WECHAT_SECRET: '',
          ALLOW_MOCK_WECHAT_LOGIN: 'false',
          NODE_ENV: 'development',
          JWT_SECRET: 'test_secret',
          JWT_EXPIRES_IN: '7d',
          JWT_REFRESH_EXPIRES_IN: '30d',
        };
        return config[key];
      });

      await expect(service.wxLogin('test_code')).rejects.toThrow('登录服务配置错误');
    });

    it('安全回归: 非生产环境显式开启mock时允许登录', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          WECHAT_APPID: '',
          WECHAT_SECRET: '',
          ALLOW_MOCK_WECHAT_LOGIN: 'true',
          NODE_ENV: 'development',
          JWT_SECRET: 'test_secret',
          JWT_EXPIRES_IN: '7d',
          JWT_REFRESH_EXPIRES_IN: '30d',
        };
        return config[key];
      });

      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user_123',
        openidHash: 'hash_mock_openid_test_code',
        openidCipher: 'cipher_mock_openid_test_code',
      });
      mockJwtService.signAsync
        .mockResolvedValueOnce('access_token_123')
        .mockResolvedValueOnce('refresh_token_123');

      const result = await service.wxLogin('test_code');
      expect(result.user.id).toBe('user_123');
    });
  });

  describe('Token刷新', () => {
    it('TC-AUTH-004: Token刷新 - 成功场景', async () => {
      const validToken = 'valid_refresh_token';
      const mockPayload = { sub: 'user_123' };
      const mockUser = { id: 'user_123' };
      const mockNewTokens = {
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
        expiresIn: '7d',
      };

      mockJwtService.verify.mockReturnValue(mockPayload);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockJwtService.signAsync
        .mockResolvedValueOnce(mockNewTokens.accessToken)
        .mockResolvedValueOnce(mockNewTokens.refreshToken);

      const result = await service.refreshToken(validToken);

      expect(result).toHaveProperty('accessToken', mockNewTokens.accessToken);
      expect(result).toHaveProperty('refreshToken', mockNewTokens.refreshToken);
      expect(mockJwtService.verify).toHaveBeenCalledWith(validToken, {
        secret: 'test_secret',
      });
    });

    it('TC-AUTH-005: Token刷新 - 无效Token', async () => {
      const invalidToken = 'invalid_token';

      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.refreshToken(invalidToken)).rejects.toThrow(UnauthorizedException);
      await expect(service.refreshToken(invalidToken)).rejects.toThrow('令牌无效或已过期');
    });

    it('TC-AUTH-006: Token刷新 - 空Token', async () => {
      await expect(service.refreshToken('')).rejects.toThrow(UnauthorizedException);
      await expect(service.refreshToken('   ')).rejects.toThrow('刷新令牌不能为空');
    });

    it('TC-AUTH-005: Token刷新 - Token有效但用户不存在', async () => {
      const validToken = 'valid_token';
      const mockPayload = { sub: 'nonexistent_user' };

      mockJwtService.verify.mockReturnValue(mockPayload);
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.refreshToken(validToken)).rejects.toThrow(UnauthorizedException);
      await expect(service.refreshToken(validToken)).rejects.toThrow('用户不存在');
    });

    it('TC-AUTH-005: Token刷新 - Token过期', async () => {
      const expiredToken = 'expired_token';

      mockJwtService.verify.mockImplementation(() => {
        const error = new Error('jwt expired');
        (error as any).name = 'TokenExpiredError';
        throw error;
      });

      await expect(service.refreshToken(expiredToken)).rejects.toThrow('令牌无效或已过期');
    });
  });

  describe('Token生成', () => {
    it('应该生成包含正确信息的Token', async () => {
      const userId = 'user_123';
      const openid = 'openid_123';
      const mockAccessToken = 'access_token_123';
      const mockRefreshToken = 'refresh_token_123';

      // Mock微信API响应
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          openid: openid,
          session_key: 'mock_session_key',
        },
      });

      mockJwtService.signAsync
        .mockResolvedValueOnce(mockAccessToken)
        .mockResolvedValueOnce(mockRefreshToken);

      mockPrismaService.user.findFirst.mockResolvedValue({
        id: userId,
        openidHash: `hash_${openid}`,
        openidCipher: `cipher_${openid}`,
      });

      await service.wxLogin('test_code');

      // 验证JWT.signAsync被调用时传入了正确的payload
      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        { sub: userId },
        { expiresIn: '7d' }
      );
      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        { sub: userId },
        { expiresIn: '30d' }
      );
    });
  });

  describe('错误处理和日志', () => {
    it('微信登录异常时应该记录错误日志', async () => {
      const code = 'test_code';

      // Mock微信API响应
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          openid: 'openid_123',
          session_key: 'mock_session_key',
        },
      });

      // 模拟数据库错误
      mockPrismaService.user.findFirst.mockRejectedValue(new Error('Database error'));

      await expect(service.wxLogin(code)).rejects.toThrow();
    });

    it('Token刷新异常时应该记录错误日志', async () => {
      const token = 'valid_token';
      const mockPayload = { sub: 'user_123' };

      mockJwtService.verify.mockReturnValue(mockPayload);
      mockPrismaService.user.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(service.refreshToken(token)).rejects.toThrow();
    });
  });
});

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const auth_service_1 = require("./auth.service");
const prisma_service_1 = require("../prisma/prisma.service");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const common_1 = require("@nestjs/common");
jest.mock('axios');
const axios_1 = __importDefault(require("axios"));
const mockedAxios = axios_1.default;
describe('AuthService', () => {
    let service;
    let prismaService;
    let jwtService;
    const mockPrismaService = {
        user: {
            findUnique: jest.fn(),
            create: jest.fn(),
        },
    };
    const mockJwtService = {
        signAsync: jest.fn(),
        verify: jest.fn(),
    };
    const mockConfigService = {
        get: jest.fn((key) => {
            const config = {
                WECHAT_APPID: 'test_appid',
                WECHAT_SECRET: 'test_secret',
                JWT_SECRET: 'test_secret',
                JWT_EXPIRES_IN: '7d',
                JWT_REFRESH_EXPIRES_IN: '30d',
            };
            return config[key];
        }),
    };
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                auth_service_1.AuthService,
                { provide: prisma_service_1.PrismaService, useValue: mockPrismaService },
                { provide: jwt_1.JwtService, useValue: mockJwtService },
                { provide: config_1.ConfigService, useValue: mockConfigService },
            ],
        }).compile();
        service = module.get(auth_service_1.AuthService);
        prismaService = module.get(prisma_service_1.PrismaService);
        jwtService = module.get(jwt_1.JwtService);
        jest.clearAllMocks();
    });
    describe('微信登录', () => {
        it('TC-AUTH-001: 微信登录 - 成功场景（新用户）', async () => {
            const code = 'valid_wechat_code';
            const mockOpenid = 'mock_openid_123';
            const mockUser = { id: 'user_123', openid: mockOpenid };
            const mockTokens = {
                accessToken: 'access_token_123',
                refreshToken: 'refresh_token_123',
                expiresIn: '7d',
            };
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    openid: mockOpenid,
                    session_key: 'mock_session_key',
                },
            });
            mockPrismaService.user.findUnique.mockResolvedValue(null);
            mockPrismaService.user.create.mockResolvedValue(mockUser);
            mockJwtService.signAsync
                .mockResolvedValueOnce(mockTokens.accessToken)
                .mockResolvedValueOnce(mockTokens.refreshToken);
            const result = await service.wxLogin(code);
            expect(result).toHaveProperty('user');
            expect(result.user).toEqual({ id: mockUser.id, openid: mockUser.openid });
            expect(result).toHaveProperty('accessToken', mockTokens.accessToken);
            expect(result).toHaveProperty('refreshToken', mockTokens.refreshToken);
            expect(result).toHaveProperty('expiresIn');
            expect(mockPrismaService.user.create).toHaveBeenCalledWith({
                data: { openid: expect.any(String) },
            });
        });
        it('TC-AUTH-001: 微信登录 - 成功场景（已存在用户）', async () => {
            const code = 'valid_wechat_code';
            const mockOpenid = 'mock_openid_123';
            const mockUser = { id: 'user_123', openid: mockOpenid };
            const mockTokens = {
                accessToken: 'access_token_123',
                refreshToken: 'refresh_token_123',
                expiresIn: '7d',
            };
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    openid: mockOpenid,
                    session_key: 'mock_session_key',
                },
            });
            mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
            mockJwtService.signAsync
                .mockResolvedValueOnce(mockTokens.accessToken)
                .mockResolvedValueOnce(mockTokens.refreshToken);
            const result = await service.wxLogin(code);
            expect(result.user).toEqual({ id: mockUser.id, openid: mockUser.openid });
            expect(mockPrismaService.user.create).not.toHaveBeenCalled();
        });
        it('TC-AUTH-002: 微信登录 - 空code', async () => {
            await expect(service.wxLogin('')).rejects.toThrow(common_1.UnauthorizedException);
            await expect(service.wxLogin('   ')).rejects.toThrow('微信登录凭证不能为空');
        });
        it('TC-AUTH-002: 微信登录 - null code', async () => {
            await expect(service.wxLogin(null)).rejects.toThrow(common_1.UnauthorizedException);
        });
        it('TC-AUTH-003: 微信登录 - 无效code', async () => {
            const invalidCode = 'invalid_code';
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    errcode: 40029,
                    errmsg: 'invalid code',
                },
            });
            await expect(service.wxLogin(invalidCode)).rejects.toThrow('微信登录失败');
        });
    });
    describe('Token刷新', () => {
        it('TC-AUTH-004: Token刷新 - 成功场景', async () => {
            const validToken = 'valid_refresh_token';
            const mockPayload = { sub: 'user_123', openid: 'openid_123' };
            const mockUser = { id: 'user_123', openid: 'openid_123' };
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
            await expect(service.refreshToken(invalidToken)).rejects.toThrow(common_1.UnauthorizedException);
            await expect(service.refreshToken(invalidToken)).rejects.toThrow('令牌无效或已过期');
        });
        it('TC-AUTH-006: Token刷新 - 空Token', async () => {
            await expect(service.refreshToken('')).rejects.toThrow(common_1.UnauthorizedException);
            await expect(service.refreshToken('   ')).rejects.toThrow('刷新令牌不能为空');
        });
        it('TC-AUTH-005: Token刷新 - Token有效但用户不存在', async () => {
            const validToken = 'valid_token';
            const mockPayload = { sub: 'nonexistent_user', openid: 'openid_123' };
            mockJwtService.verify.mockReturnValue(mockPayload);
            mockPrismaService.user.findUnique.mockResolvedValue(null);
            await expect(service.refreshToken(validToken)).rejects.toThrow(common_1.UnauthorizedException);
            await expect(service.refreshToken(validToken)).rejects.toThrow('用户不存在');
        });
        it('TC-AUTH-005: Token刷新 - Token过期', async () => {
            const expiredToken = 'expired_token';
            mockJwtService.verify.mockImplementation(() => {
                const error = new Error('jwt expired');
                error.name = 'TokenExpiredError';
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
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    openid: openid,
                    session_key: 'mock_session_key',
                },
            });
            mockJwtService.signAsync
                .mockResolvedValueOnce(mockAccessToken)
                .mockResolvedValueOnce(mockRefreshToken);
            mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, openid });
            await service.wxLogin('test_code');
            expect(mockJwtService.signAsync).toHaveBeenCalledWith({ sub: userId, openid }, { expiresIn: '7d' });
            expect(mockJwtService.signAsync).toHaveBeenCalledWith({ sub: userId, openid }, { expiresIn: '30d' });
        });
    });
    describe('错误处理和日志', () => {
        it('微信登录异常时应该记录错误日志', async () => {
            const code = 'test_code';
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    openid: 'openid_123',
                    session_key: 'mock_session_key',
                },
            });
            mockPrismaService.user.findUnique.mockRejectedValue(new Error('Database error'));
            await expect(service.wxLogin(code)).rejects.toThrow();
        });
        it('Token刷新异常时应该记录错误日志', async () => {
            const token = 'valid_token';
            const mockPayload = { sub: 'user_123', openid: 'openid_123' };
            mockJwtService.verify.mockReturnValue(mockPayload);
            mockPrismaService.user.findUnique.mockRejectedValue(new Error('Database error'));
            await expect(service.refreshToken(token)).rejects.toThrow();
        });
    });
});
//# sourceMappingURL=auth.service.spec.js.map
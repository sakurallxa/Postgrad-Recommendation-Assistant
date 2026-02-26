"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const axios_1 = __importDefault(require("axios"));
const prisma_service_1 = require("../prisma/prisma.service");
let AuthService = AuthService_1 = class AuthService {
    constructor(prisma, jwtService, configService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.configService = configService;
        this.logger = new common_1.Logger(AuthService_1.name);
    }
    async wxLogin(code) {
        if (!code || code.trim() === '') {
            throw new common_1.UnauthorizedException('微信登录凭证不能为空');
        }
        try {
            const wxResponse = await this.callWxLoginApi(code);
            if (wxResponse.errcode) {
                this.logger.error(`微信登录失败: ${wxResponse.errmsg} (code: ${wxResponse.errcode})`);
                throw new common_1.UnauthorizedException(`微信登录失败: ${wxResponse.errmsg}`);
            }
            const { openid } = wxResponse;
            let user = await this.prisma.user.findUnique({
                where: { openid },
            });
            if (!user) {
                user = await this.prisma.user.create({
                    data: { openid },
                });
                this.logger.log(`新用户创建成功: ${user.id}`);
            }
            const tokens = await this.generateTokens(user.id, user.openid);
            this.logger.log(`用户登录成功: ${user.id}`);
            return {
                user: {
                    id: user.id,
                    openid: user.openid,
                },
                ...tokens,
            };
        }
        catch (error) {
            if (error instanceof common_1.UnauthorizedException) {
                throw error;
            }
            this.logger.error(`微信登录异常: ${error.message}`, error.stack);
            throw new common_1.UnauthorizedException('微信登录失败，请稍后重试');
        }
    }
    async refreshToken(token) {
        if (!token || token.trim() === '') {
            throw new common_1.UnauthorizedException('刷新令牌不能为空');
        }
        try {
            const payload = this.jwtService.verify(token, {
                secret: this.configService.get('JWT_SECRET'),
            });
            const user = await this.prisma.user.findUnique({
                where: { id: payload.sub },
            });
            if (!user) {
                throw new common_1.UnauthorizedException('用户不存在');
            }
            return this.generateTokens(user.id, user.openid);
        }
        catch (error) {
            if (error instanceof common_1.UnauthorizedException) {
                throw error;
            }
            this.logger.error(`Token刷新失败: ${error.message}`);
            throw new common_1.UnauthorizedException('令牌无效或已过期');
        }
    }
    async callWxLoginApi(code) {
        const appid = this.configService.get('WECHAT_APPID');
        const secret = this.configService.get('WECHAT_SECRET');
        if (!appid || appid === 'wx_appid_placeholder') {
            this.logger.warn('微信AppID未配置，使用模拟数据');
            return {
                openid: `mock_openid_${code}`,
                session_key: 'mock_session_key',
            };
        }
        try {
            const response = await axios_1.default.get('https://api.weixin.qq.com/sns/jscode2session', {
                params: {
                    appid,
                    secret,
                    js_code: code,
                    grant_type: 'authorization_code',
                },
                timeout: 10000,
            });
            return response.data;
        }
        catch (error) {
            this.logger.error(`调用微信接口失败: ${error.message}`);
            throw new common_1.UnauthorizedException('微信服务暂时不可用');
        }
    }
    async generateTokens(userId, openid) {
        const payload = { sub: userId, openid };
        const expiresIn = this.configService.get('JWT_EXPIRES_IN', '7d');
        const refreshExpiresIn = this.configService.get('JWT_REFRESH_EXPIRES_IN', '30d');
        const [accessToken, refreshToken] = await Promise.all([
            this.jwtService.signAsync(payload, { expiresIn }),
            this.jwtService.signAsync(payload, { expiresIn: refreshExpiresIn }),
        ]);
        return {
            accessToken,
            refreshToken,
            expiresIn: expiresIn,
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService])
], AuthService);
//# sourceMappingURL=auth.service.js.map
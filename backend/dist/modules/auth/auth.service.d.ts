import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
interface TokenResponse {
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
}
interface LoginResponse {
    user: {
        id: string;
        openid: string;
    };
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
}
export declare class AuthService {
    private readonly prisma;
    private readonly jwtService;
    private readonly configService;
    private readonly logger;
    constructor(prisma: PrismaService, jwtService: JwtService, configService: ConfigService);
    wxLogin(code: string): Promise<LoginResponse>;
    refreshToken(token: string): Promise<TokenResponse>;
    private callWxLoginApi;
    private generateTokens;
}
export {};

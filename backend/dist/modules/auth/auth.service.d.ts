import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
export declare class AuthService {
    private readonly prisma;
    private readonly jwtService;
    private readonly configService;
    constructor(prisma: PrismaService, jwtService: JwtService, configService: ConfigService);
    wxLogin(code: string): Promise<{
        accessToken: any;
        refreshToken: any;
        expiresIn: any;
        user: {
            id: string;
            openid: string;
        };
    }>;
    refreshToken(token: string): Promise<{
        accessToken: any;
        refreshToken: any;
        expiresIn: any;
    }>;
    private generateTokens;
}

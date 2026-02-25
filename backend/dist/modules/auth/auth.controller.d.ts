import { AuthService } from './auth.service';
import { WxLoginDto } from './dto/wx-login.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    wxLogin(dto: WxLoginDto): Promise<{
        accessToken: any;
        refreshToken: any;
        expiresIn: any;
        user: {
            id: string;
            openid: string;
        };
    }>;
    refreshToken(auth: string): Promise<{
        accessToken: any;
        refreshToken: any;
        expiresIn: any;
    }>;
}

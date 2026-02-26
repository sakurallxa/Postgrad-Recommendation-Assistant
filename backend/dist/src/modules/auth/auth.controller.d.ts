import { AuthService } from './auth.service';
import { WxLoginDto } from './dto/wx-login.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    wxLogin(dto: WxLoginDto): Promise<import("./auth.service").LoginResponse>;
    refreshToken(auth: string): Promise<import("./auth.service").TokenResponse>;
}

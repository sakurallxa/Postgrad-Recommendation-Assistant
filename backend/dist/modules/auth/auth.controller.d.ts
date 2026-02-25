import { AuthService } from './auth.service';
import { WxLoginDto } from './dto/wx-login.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    wxLogin(dto: WxLoginDto): Promise<any>;
    refreshToken(auth: string): Promise<any>;
}

import { NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
export declare class RateLimitMiddleware implements NestMiddleware {
    private readonly configService;
    private readonly requestMap;
    private readonly windowMs;
    private readonly maxRequests;
    private readonly cleanupTimer;
    constructor(configService: ConfigService);
    use(req: Request, res: Response, next: NextFunction): void;
    private getClientIp;
    private cleanup;
}

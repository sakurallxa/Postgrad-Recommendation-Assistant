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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitMiddleware = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let RateLimitMiddleware = class RateLimitMiddleware {
    constructor(configService) {
        this.configService = configService;
        this.requestMap = new Map();
        this.windowMs = this.configService.get('RATE_LIMIT_WINDOW', 60000);
        this.maxRequests = this.configService.get('RATE_LIMIT_MAX', 100);
        this.cleanupTimer = setInterval(() => this.cleanup(), this.windowMs);
        this.cleanupTimer.unref();
    }
    use(req, res, next) {
        const clientIp = this.getClientIp(req);
        const now = Date.now();
        let record = this.requestMap.get(clientIp);
        if (!record || now > record.resetTime) {
            record = {
                count: 1,
                resetTime: now + this.windowMs,
            };
            this.requestMap.set(clientIp, record);
        }
        else {
            record.count++;
        }
        if (record.count > this.maxRequests) {
            const retryAfter = Math.ceil((record.resetTime - now) / 1000);
            res.setHeader('Retry-After', retryAfter);
            res.setHeader('X-RateLimit-Limit', this.maxRequests);
            res.setHeader('X-RateLimit-Remaining', 0);
            res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));
            throw new common_1.HttpException({
                code: 1005,
                message: '请求过于频繁，请稍后再试',
                details: `请在 ${retryAfter} 秒后重试`,
            }, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        res.setHeader('X-RateLimit-Limit', this.maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - record.count));
        res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));
        next();
    }
    getClientIp(req) {
        const forwarded = req.headers['x-forwarded-for'];
        const ip = forwarded
            ? (typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0])
            : req.ip || req.connection.remoteAddress || 'unknown';
        return ip;
    }
    cleanup() {
        const now = Date.now();
        for (const [ip, record] of this.requestMap.entries()) {
            if (now > record.resetTime) {
                this.requestMap.delete(ip);
            }
        }
    }
};
exports.RateLimitMiddleware = RateLimitMiddleware;
exports.RateLimitMiddleware = RateLimitMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RateLimitMiddleware);
//# sourceMappingURL=rate-limit.middleware.js.map
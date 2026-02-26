import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

/**
 * 请求记录接口
 */
interface RequestRecord {
  count: number;
  resetTime: number;
}

/**
 * API限流中间件
 * 基于IP地址进行限流控制
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly requestMap = new Map<string, RequestRecord>();
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService) {
    this.windowMs = this.configService.get<number>('RATE_LIMIT_WINDOW', 60000); // 默认1分钟
    this.maxRequests = this.configService.get<number>('RATE_LIMIT_MAX', 100); // 默认100请求

    // 定期清理过期的请求记录，unref避免阻塞进程退出
    this.cleanupTimer = setInterval(() => this.cleanup(), this.windowMs);
    this.cleanupTimer.unref();
  }

  use(req: Request, res: Response, next: NextFunction) {
    const clientIp = this.getClientIp(req);
    const now = Date.now();

    // 获取或创建请求记录
    let record = this.requestMap.get(clientIp);
    
    if (!record || now > record.resetTime) {
      // 新窗口期
      record = {
        count: 1,
        resetTime: now + this.windowMs,
      };
      this.requestMap.set(clientIp, record);
    } else {
      // 当前窗口期
      record.count++;
    }

    // 检查是否超过限制
    if (record.count > this.maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      
      res.setHeader('Retry-After', retryAfter);
      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

      throw new HttpException(
        {
          code: 1005,
          message: '请求过于频繁，请稍后再试',
          details: `请在 ${retryAfter} 秒后重试`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 设置响应头
    res.setHeader('X-RateLimit-Limit', this.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    next();
  }

  /**
   * 获取客户端IP地址
   */
  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded 
      ? (typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0])
      : req.ip || req.connection.remoteAddress || 'unknown';
    
    return ip;
  }

  /**
   * 清理过期的请求记录
   */
  private cleanup() {
    const now = Date.now();
    for (const [ip, record] of this.requestMap.entries()) {
      if (now > record.resetTime) {
        this.requestMap.delete(ip);
      }
    }
  }
}

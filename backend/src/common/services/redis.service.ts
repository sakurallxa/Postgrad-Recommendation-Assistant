import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis缓存服务
 * 提供统一的缓存操作接口
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private enabled = true;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    const redisEnabled = this.configService.get<string>('REDIS_ENABLED', 'true');
    this.enabled = redisEnabled !== 'false' && nodeEnv !== 'test';

    if (!this.enabled) {
      this.logger.log('Redis已禁用，使用无缓存模式');
      return;
    }

    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD', '');
    const db = this.configService.get<number>('REDIS_DB', 0);

    this.client = new Redis({
      host,
      port,
      password: password || undefined,
      db,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => {
      this.logger.log('Redis连接成功');
    });

    this.client.on('error', (error) => {
      this.logger.error('Redis连接错误:', error.message);
    });
  }

  async onModuleDestroy() {
    if (!this.client) {
      return;
    }
    await this.client.quit();
    this.logger.log('Redis连接已关闭');
  }

  /**
   * 获取缓存值
   * @param key 缓存键
   * @returns 缓存值，不存在返回null
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.client) {
      return null;
    }
    try {
      const value = await this.client.get(key);
      if (value) {
        return JSON.parse(value) as T;
      }
      return null;
    } catch (error) {
      this.logger.error(`Redis获取失败: ${key}`, error.message);
      return null;
    }
  }

  /**
   * 设置缓存值
   * @param key 缓存键
   * @param value 缓存值
   * @param ttl 过期时间（秒）
   */
  async set(key: string, value: any, ttl: number): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      const serialized = JSON.stringify(value);
      await this.client.setex(key, ttl, serialized);
    } catch (error) {
      this.logger.error(`Redis设置失败: ${key}`, error.message);
    }
  }

  /**
   * 删除缓存
   * @param key 缓存键
   */
  async del(key: string): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.error(`Redis删除失败: ${key}`, error.message);
    }
  }

  /**
   * 删除匹配模式的缓存
   * @param pattern 匹配模式
   */
  async delPattern(pattern: string): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      this.logger.error(`Redis批量删除失败: ${pattern}`, error.message);
    }
  }

  /**
   * 检查键是否存在
   * @param key 缓存键
   */
  async exists(key: string): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Redis检查失败: ${key}`, error.message);
      return false;
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<{
    connected: boolean;
    dbSize: number;
  }> {
    if (!this.client) {
      return {
        connected: false,
        dbSize: 0,
      };
    }
    try {
      const dbSize = await this.client.dbsize();
      return {
        connected: this.client.status === 'ready',
        dbSize,
      };
    } catch (error) {
      this.logger.error('Redis统计失败:', error.message);
      return {
        connected: false,
        dbSize: 0,
      };
    }
  }
}

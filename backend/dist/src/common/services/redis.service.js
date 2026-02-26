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
var RedisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = __importDefault(require("ioredis"));
let RedisService = RedisService_1 = class RedisService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(RedisService_1.name);
        this.client = null;
        this.enabled = true;
    }
    async onModuleInit() {
        const nodeEnv = this.configService.get('NODE_ENV', 'development');
        const redisEnabled = this.configService.get('REDIS_ENABLED', 'true');
        this.enabled = redisEnabled !== 'false' && nodeEnv !== 'test';
        if (!this.enabled) {
            this.logger.log('Redis已禁用，使用无缓存模式');
            return;
        }
        const host = this.configService.get('REDIS_HOST', 'localhost');
        const port = this.configService.get('REDIS_PORT', 6379);
        const password = this.configService.get('REDIS_PASSWORD', '');
        const db = this.configService.get('REDIS_DB', 0);
        this.client = new ioredis_1.default({
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
    async get(key) {
        if (!this.client) {
            return null;
        }
        try {
            const value = await this.client.get(key);
            if (value) {
                return JSON.parse(value);
            }
            return null;
        }
        catch (error) {
            this.logger.error(`Redis获取失败: ${key}`, error.message);
            return null;
        }
    }
    async set(key, value, ttl) {
        if (!this.client) {
            return;
        }
        try {
            const serialized = JSON.stringify(value);
            await this.client.setex(key, ttl, serialized);
        }
        catch (error) {
            this.logger.error(`Redis设置失败: ${key}`, error.message);
        }
    }
    async del(key) {
        if (!this.client) {
            return;
        }
        try {
            await this.client.del(key);
        }
        catch (error) {
            this.logger.error(`Redis删除失败: ${key}`, error.message);
        }
    }
    async delPattern(pattern) {
        if (!this.client) {
            return;
        }
        try {
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                await this.client.del(...keys);
            }
        }
        catch (error) {
            this.logger.error(`Redis批量删除失败: ${pattern}`, error.message);
        }
    }
    async exists(key) {
        if (!this.client) {
            return false;
        }
        try {
            const result = await this.client.exists(key);
            return result === 1;
        }
        catch (error) {
            this.logger.error(`Redis检查失败: ${key}`, error.message);
            return false;
        }
    }
    async getStats() {
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
        }
        catch (error) {
            this.logger.error('Redis统计失败:', error.message);
            return {
                connected: false,
                dbSize: 0,
            };
        }
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map
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
var MonitoringService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../modules/prisma/prisma.service");
const redis_service_1 = require("./redis.service");
let MonitoringService = MonitoringService_1 = class MonitoringService {
    constructor(configService, prisma, redisService) {
        this.configService = configService;
        this.prisma = prisma;
        this.redisService = redisService;
        this.logger = new common_1.Logger(MonitoringService_1.name);
        this.alertRules = [];
        this.metricsHistory = [];
        this.maxHistorySize = 1000;
        this.initializeAlertRules();
    }
    initializeAlertRules() {
        this.alertRules.push({
            name: 'HighErrorRate',
            condition: (metrics) => metrics.requests.errorRate > 0.1,
            severity: 'critical',
            message: '错误率超过10%',
        }, {
            name: 'SlowResponseTime',
            condition: (metrics) => metrics.responseTime.p95 > 2000,
            severity: 'warning',
            message: 'P95响应时间超过2秒',
        }, {
            name: 'HighMemoryUsage',
            condition: (metrics) => metrics.memory.percentage > 80,
            severity: 'warning',
            message: '内存使用率超过80%',
        }, {
            name: 'DatabaseConnectionPool',
            condition: (metrics) => metrics.connections.active > 100,
            severity: 'critical',
            message: '数据库连接池接近上限',
        });
    }
    async collectSystemMetrics() {
        const usage = process.memoryUsage();
        const totalMemory = require('os').totalmem();
        const metrics = {
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
                used: Math.round(usage.heapUsed / 1024 / 1024),
                total: Math.round(totalMemory / 1024 / 1024),
                percentage: Math.round((usage.heapUsed / totalMemory) * 100),
            },
            cpu: {
                usage: await this.getCPUUsage(),
            },
        };
        return metrics;
    }
    async collectApplicationMetrics() {
        const requestStats = await this.redisService.get('app:metrics:requests');
        const metrics = {
            timestamp: new Date().toISOString(),
            requests: {
                total: requestStats?.total || 0,
                success: requestStats?.success || 0,
                error: requestStats?.error || 0,
                errorRate: requestStats?.total
                    ? requestStats.error / requestStats.total
                    : 0,
            },
            responseTime: {
                avg: this.calculateAverage(requestStats?.responseTimes || []),
                p95: this.calculatePercentile(requestStats?.responseTimes || [], 95),
                p99: this.calculatePercentile(requestStats?.responseTimes || [], 99),
            },
            activeConnections: await this.getActiveConnections(),
        };
        return metrics;
    }
    async collectDatabaseMetrics() {
        try {
            const connections = await this.prisma.$queryRaw `SELECT COUNT(*) as count FROM information_schema.processlist WHERE command != 'Sleep'`;
            const slowQueries = await this.prisma.$queryRaw `SELECT COUNT(*) as count FROM mysql.slow_log WHERE start_time > DATE_SUB(NOW(), INTERVAL 1 HOUR)`;
            const metrics = {
                timestamp: new Date().toISOString(),
                connections: {
                    active: Number(connections[0]?.count || 0),
                    idle: 0,
                    total: Number(connections[0]?.count || 0),
                },
                queries: {
                    total: 0,
                    slow: Number(slowQueries[0]?.count || 0),
                    avgTime: 0,
                },
            };
            return metrics;
        }
        catch (error) {
            this.logger.error('收集数据库指标失败:', error.message);
            return {
                timestamp: new Date().toISOString(),
                connections: { active: 0, idle: 0, total: 0 },
                queries: { total: 0, slow: 0, avgTime: 0 },
            };
        }
    }
    async checkAlerts() {
        const alerts = [];
        const systemMetrics = await this.collectSystemMetrics();
        const appMetrics = await this.collectApplicationMetrics();
        const dbMetrics = await this.collectDatabaseMetrics();
        for (const rule of this.alertRules) {
            let triggered = false;
            if (rule.name === 'HighMemoryUsage') {
                triggered = rule.condition(systemMetrics);
            }
            else if (['HighErrorRate', 'SlowResponseTime'].includes(rule.name)) {
                triggered = rule.condition(appMetrics);
            }
            else if (rule.name === 'DatabaseConnectionPool') {
                triggered = rule.condition(dbMetrics);
            }
            if (triggered) {
                alerts.push({
                    rule: rule.name,
                    severity: rule.severity,
                    message: rule.message,
                });
                this.logger.warn(`告警触发: ${rule.name} - ${rule.message}`);
            }
        }
        return alerts;
    }
    async recordRequest(method, route, statusCode, responseTime) {
        const key = 'app:metrics:requests';
        const stats = (await this.redisService.get(key)) || {
            total: 0,
            success: 0,
            error: 0,
            responseTimes: [],
        };
        stats.total++;
        if (statusCode >= 200 && statusCode < 400) {
            stats.success++;
        }
        else {
            stats.error++;
        }
        stats.responseTimes.push(responseTime);
        if (stats.responseTimes.length > 1000) {
            stats.responseTimes = stats.responseTimes.slice(-1000);
        }
        await this.redisService.set(key, stats, 86400);
    }
    async getHealthStatus() {
        const checks = {
            database: false,
            redis: false,
            memory: false,
        };
        try {
            await this.prisma.$queryRaw `SELECT 1`;
            checks.database = true;
        }
        catch (error) {
            this.logger.error('数据库健康检查失败:', error.message);
        }
        try {
            const redisStats = await this.redisService.getStats();
            checks.redis = redisStats.connected;
        }
        catch (error) {
            this.logger.error('Redis健康检查失败:', error.message);
        }
        const usage = process.memoryUsage();
        checks.memory = usage.heapUsed / usage.heapTotal < 0.9;
        const allHealthy = Object.values(checks).every((v) => v);
        const someHealthy = Object.values(checks).some((v) => v);
        return {
            status: allHealthy ? 'healthy' : someHealthy ? 'degraded' : 'unhealthy',
            checks,
        };
    }
    getCPUUsage() {
        return new Promise((resolve) => {
            const startUsage = process.cpuUsage();
            setTimeout(() => {
                const endUsage = process.cpuUsage(startUsage);
                const usagePercent = ((endUsage.user + endUsage.system) / 1000000 / 1) * 100;
                resolve(Math.round(usagePercent));
            }, 1000);
        });
    }
    async getActiveConnections() {
        const connections = await this.redisService.get('app:connections:active');
        return connections || 0;
    }
    calculateAverage(values) {
        if (values.length === 0)
            return 0;
        return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    }
    calculatePercentile(values, percentile) {
        if (values.length === 0)
            return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }
};
exports.MonitoringService = MonitoringService;
exports.MonitoringService = MonitoringService = MonitoringService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        redis_service_1.RedisService])
], MonitoringService);
//# sourceMappingURL=monitoring.service.js.map
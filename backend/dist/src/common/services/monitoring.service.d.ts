import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { RedisService } from './redis.service';
interface SystemMetrics {
    timestamp: string;
    uptime: number;
    memory: {
        used: number;
        total: number;
        percentage: number;
    };
    cpu: {
        usage: number;
    };
}
interface ApplicationMetrics {
    timestamp: string;
    requests: {
        total: number;
        success: number;
        error: number;
        errorRate: number;
    };
    responseTime: {
        avg: number;
        p95: number;
        p99: number;
    };
    activeConnections: number;
}
interface DatabaseMetrics {
    timestamp: string;
    connections: {
        active: number;
        idle: number;
        total: number;
    };
    queries: {
        total: number;
        slow: number;
        avgTime: number;
    };
}
export declare class MonitoringService {
    private readonly configService;
    private readonly prisma;
    private readonly redisService;
    private readonly logger;
    private readonly alertRules;
    private metricsHistory;
    private readonly maxHistorySize;
    constructor(configService: ConfigService, prisma: PrismaService, redisService: RedisService);
    private initializeAlertRules;
    collectSystemMetrics(): Promise<SystemMetrics>;
    collectApplicationMetrics(): Promise<ApplicationMetrics>;
    collectDatabaseMetrics(): Promise<DatabaseMetrics>;
    checkAlerts(): Promise<Array<{
        rule: string;
        severity: string;
        message: string;
    }>>;
    recordRequest(method: string, route: string, statusCode: number, responseTime: number): Promise<void>;
    getHealthStatus(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        checks: Record<string, boolean>;
    }>;
    private getCPUUsage;
    private getActiveConnections;
    private calculateAverage;
    private calculatePercentile;
}
export {};

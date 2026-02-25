import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { RedisService } from './redis.service';

/**
 * 系统指标接口
 */
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

/**
 * 应用指标接口
 */
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

/**
 * 数据库指标接口
 */
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

/**
 * 告警规则接口
 */
interface AlertRule {
  name: string;
  condition: (metrics: any) => boolean;
  severity: 'warning' | 'critical';
  message: string;
}

/**
 * 监控服务
 * 负责收集系统指标、应用指标和数据库指标
 * 并提供告警功能
 */
@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private readonly alertRules: AlertRule[] = [];
  private metricsHistory: any[] = [];
  private readonly maxHistorySize = 1000;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {
    this.initializeAlertRules();
  }

  /**
   * 初始化告警规则
   */
  private initializeAlertRules() {
    this.alertRules.push(
      {
        name: 'HighErrorRate',
        condition: (metrics: ApplicationMetrics) => metrics.requests.errorRate > 0.1,
        severity: 'critical',
        message: '错误率超过10%',
      },
      {
        name: 'SlowResponseTime',
        condition: (metrics: ApplicationMetrics) => metrics.responseTime.p95 > 2000,
        severity: 'warning',
        message: 'P95响应时间超过2秒',
      },
      {
        name: 'HighMemoryUsage',
        condition: (metrics: SystemMetrics) => metrics.memory.percentage > 80,
        severity: 'warning',
        message: '内存使用率超过80%',
      },
      {
        name: 'DatabaseConnectionPool',
        condition: (metrics: DatabaseMetrics) => metrics.connections.active > 100,
        severity: 'critical',
        message: '数据库连接池接近上限',
      },
    );
  }

  /**
   * 收集系统指标
   */
  async collectSystemMetrics(): Promise<SystemMetrics> {
    const usage = process.memoryUsage();
    const totalMemory = require('os').totalmem();

    const metrics: SystemMetrics = {
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

  /**
   * 收集应用指标
   */
  async collectApplicationMetrics(): Promise<ApplicationMetrics> {
    // 从Redis获取请求统计
    const requestStats = await this.redisService.get<{
      total: number;
      success: number;
      error: number;
      responseTimes: number[];
    }>('app:metrics:requests');

    const metrics: ApplicationMetrics = {
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

  /**
   * 收集数据库指标
   */
  async collectDatabaseMetrics(): Promise<DatabaseMetrics> {
    try {
      // 获取连接信息
      const connections = await this.prisma.$queryRaw<
        Array<{ count: number }>
      >`SELECT COUNT(*) as count FROM information_schema.processlist WHERE command != 'Sleep'`;

      // 获取慢查询数量
      const slowQueries = await this.prisma.$queryRaw<
        Array<{ count: number }>
      >`SELECT COUNT(*) as count FROM mysql.slow_log WHERE start_time > DATE_SUB(NOW(), INTERVAL 1 HOUR)`;

      const metrics: DatabaseMetrics = {
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
    } catch (error) {
      this.logger.error('收集数据库指标失败:', error.message);
      return {
        timestamp: new Date().toISOString(),
        connections: { active: 0, idle: 0, total: 0 },
        queries: { total: 0, slow: 0, avgTime: 0 },
      };
    }
  }

  /**
   * 检查告警
   */
  async checkAlerts(): Promise<Array<{ rule: string; severity: string; message: string }>> {
    const alerts: Array<{ rule: string; severity: string; message: string }> = [];

    const systemMetrics = await this.collectSystemMetrics();
    const appMetrics = await this.collectApplicationMetrics();
    const dbMetrics = await this.collectDatabaseMetrics();

    for (const rule of this.alertRules) {
      let triggered = false;

      if (rule.name === 'HighMemoryUsage') {
        triggered = rule.condition(systemMetrics);
      } else if (['HighErrorRate', 'SlowResponseTime'].includes(rule.name)) {
        triggered = rule.condition(appMetrics);
      } else if (rule.name === 'DatabaseConnectionPool') {
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

  /**
   * 记录请求指标
   */
  async recordRequest(
    method: string,
    route: string,
    statusCode: number,
    responseTime: number,
  ): Promise<void> {
    const key = 'app:metrics:requests';
    const stats = (await this.redisService.get<{
      total: number;
      success: number;
      error: number;
      responseTimes: number[];
    }>(key)) || {
      total: 0,
      success: 0,
      error: 0,
      responseTimes: [],
    };

    stats.total++;
    if (statusCode >= 200 && statusCode < 400) {
      stats.success++;
    } else {
      stats.error++;
    }

    stats.responseTimes.push(responseTime);

    // 只保留最近1000个响应时间
    if (stats.responseTimes.length > 1000) {
      stats.responseTimes = stats.responseTimes.slice(-1000);
    }

    await this.redisService.set(key, stats, 86400); // 24小时过期
  }

  /**
   * 获取健康状态
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, boolean>;
  }> {
    const checks: Record<string, boolean> = {
      database: false,
      redis: false,
      memory: false,
    };

    try {
      // 检查数据库
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch (error) {
      this.logger.error('数据库健康检查失败:', error.message);
    }

    try {
      // 检查Redis
      const redisStats = await this.redisService.getStats();
      checks.redis = redisStats.connected;
    } catch (error) {
      this.logger.error('Redis健康检查失败:', error.message);
    }

    // 检查内存
    const usage = process.memoryUsage();
    checks.memory = usage.heapUsed / usage.heapTotal < 0.9;

    const allHealthy = Object.values(checks).every((v) => v);
    const someHealthy = Object.values(checks).some((v) => v);

    return {
      status: allHealthy ? 'healthy' : someHealthy ? 'degraded' : 'unhealthy',
      checks,
    };
  }

  /**
   * 获取CPU使用率
   */
  private getCPUUsage(): Promise<number> {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const usagePercent =
          ((endUsage.user + endUsage.system) / 1000000 / 1) * 100;
        resolve(Math.round(usagePercent));
      }, 1000);
    });
  }

  /**
   * 获取活跃连接数
   */
  private async getActiveConnections(): Promise<number> {
    // 从Redis获取活跃连接统计
    const connections = await this.redisService.get<number>('app:connections:active');
    return connections || 0;
  }

  /**
   * 计算平均值
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }

  /**
   * 计算百分位数
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

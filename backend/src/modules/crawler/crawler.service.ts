import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as path from 'path';

interface CrawlerTask {
  id: string;
  logId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  universityId?: string;
  priority?: string;
  startTime?: Date;
  endTime?: Date;
  result?: any;
  error?: string;
}

/**
 * 爬虫服务
 * 负责触发和管理Python爬虫任务
 */
@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);
  private readonly crawlerPath: string;
  private activeTasks: Map<string, CrawlerTask> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    // 爬虫项目路径
    this.crawlerPath = path.resolve(process.cwd(), '..', 'crawler');
  }

  /**
   * 触发爬虫任务
   * 支持全量爬取或指定院校
   */
  async trigger(universityId?: string, priority?: string) {
    // 检查是否已有运行中的任务
    const runningTasks = Array.from(this.activeTasks.values()).filter(
      task => task.status === 'running'
    );
    
    if (runningTasks.length > 0) {
      throw new BadRequestException('已有爬虫任务正在运行，请等待完成后再触发');
    }

    const taskId = this.generateTaskId();

    // 先创建数据库记录，获取logId
    const log = await this.prisma.crawlerLog.create({
      data: {
        universityId: universityId || 'all',
        status: 'running',
        startTime: new Date(),
      },
    });

    // 创建任务记录
    const task: CrawlerTask = {
      id: taskId,
      logId: log.id,
      status: 'pending',
      universityId,
      priority,
    };
    this.activeTasks.set(taskId, task);

    // 异步执行爬虫
    this.executeCrawler(task);

    return {
      message: '爬虫任务已触发',
      taskId,
      logId: log.id,
      status: 'running',
    };
  }

  /**
   * 执行爬虫命令
   */
  private async executeCrawler(task: CrawlerTask): Promise<void> {
    task.status = 'running';
    task.startTime = new Date();

    try {
      const args = ['crawl', 'university'];
      
      if (task.universityId) {
        args.push('-a', `university_id=${task.universityId}`);
      }
      if (task.priority) {
        args.push('-a', `priority=${task.priority}`);
      }

      this.logger.log(`启动爬虫任务: ${task.id}, 参数: ${args.join(' ')}`);

      const result = await this.runScrapyCommand(args);
      
      task.status = 'completed';
      task.endTime = new Date();
      task.result = result;

      // 使用logId精确更新数据库记录
      await this.prisma.crawlerLog.update({
        where: { id: task.logId },
        data: {
          status: 'success',
          endTime: new Date(),
          itemsCount: result.itemCount || 0,
        },
      });

      this.logger.log(`爬虫任务完成: ${task.id}`);
      
      // 清理已完成的任务（1小时后）
      this.scheduleTaskCleanup(task.id);
    } catch (error) {
      task.status = 'failed';
      task.endTime = new Date();
      task.error = error.message;

      // 使用logId精确更新数据库记录
      await this.prisma.crawlerLog.update({
        where: { id: task.logId },
        data: {
          status: 'failed',
          endTime: new Date(),
          errorMsg: error.message,
        },
      });

      this.logger.error(`爬虫任务失败: ${task.id}`, error.message);
      
      // 清理已完成的任务（1小时后）
      this.scheduleTaskCleanup(task.id);
    }
  }

  /**
   * 定时清理已完成的任务，防止内存泄漏
   */
  private scheduleTaskCleanup(taskId: string): void {
    setTimeout(() => {
      this.activeTasks.delete(taskId);
      this.logger.debug(`已清理完成任务: ${taskId}`);
    }, 60 * 60 * 1000); // 1小时后清理
  }

  /**
   * 运行Scrapy命令
   */
  private runScrapyCommand(args: string[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const scrapyCmd = 'scrapy';
      const options = {
        cwd: this.crawlerPath,
        env: {
          ...process.env,
          PYTHONPATH: this.crawlerPath,
        },
      };

      this.logger.log(`执行命令: ${scrapyCmd} ${args.join(' ')}`);

      const child = spawn(scrapyCmd, args, options);
      
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
        this.logger.log(`[Scrapy] ${data.toString().trim()}`);
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
        this.logger.warn(`[Scrapy Error] ${data.toString().trim()}`);
      });

      child.on('close', (code) => {
        if (code === 0) {
          // 解析输出结果
          const result = this.parseCrawlerOutput(stdout);
          resolve(result);
        } else {
          reject(new Error(`爬虫进程退出码: ${code}, 错误: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`启动爬虫失败: ${error.message}`));
      });

      // 设置超时 - 先发送SIGTERM，5秒后如果仍在运行则强制终止
      const timeoutHandle = setTimeout(() => {
        this.logger.warn(`爬虫任务超时，尝试终止进程: ${child.pid}`);
        child.kill('SIGTERM');
        
        // 5秒后强制终止
        setTimeout(() => {
          if (!child.killed) {
            this.logger.error(`爬虫进程未响应SIGTERM，强制终止: ${child.pid}`);
            child.kill('SIGKILL');
          }
        }, 5000);
      }, 30 * 60 * 1000); // 30分钟超时
      
      // 清理超时定时器
      child.on('close', () => {
        clearTimeout(timeoutHandle);
      });
    });
  }

  /**
   * 解析爬虫输出
   */
  private parseCrawlerOutput(output: string): any {
    // 解析统计信息
    const stats: any = {
      itemCount: 0,
      requestCount: 0,
      errorCount: 0,
    };

    // 匹配统计信息
    const itemMatch = output.match(/(\d+) items scraped/);
    if (itemMatch) {
      stats.itemCount = parseInt(itemMatch[1], 10);
    }

    const requestMatch = output.match(/(\d+) requests/);
    if (requestMatch) {
      stats.requestCount = parseInt(requestMatch[1], 10);
    }

    const errorMatch = output.match(/(\d+) errors/);
    if (errorMatch) {
      stats.errorCount = parseInt(errorMatch[1], 10);
    }

    return stats;
  }

  /**
   * 获取爬虫日志
   */
  async getLogs() {
    return this.prisma.crawlerLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * 获取任务状态
   * 支持通过taskId（内存任务ID）或logId（数据库记录ID）查询
   */
  async getTaskStatus(taskId: string) {
    // 首先尝试从内存中获取活跃任务
    const task = this.activeTasks.get(taskId);
    if (task) {
      return {
        taskId: task.id,
        logId: task.logId,
        status: task.status,
        startTime: task.startTime,
        endTime: task.endTime,
        result: task.result,
        error: task.error,
      };
    }

    // 内存中没有找到，尝试按taskId查找对应的logId映射
    // 遍历所有活跃任务查找是否有匹配的logId
    for (const [, activeTask] of this.activeTasks) {
      if (activeTask.logId === taskId) {
        return {
          taskId: activeTask.id,
          logId: activeTask.logId,
          status: activeTask.status,
          startTime: activeTask.startTime,
          endTime: activeTask.endTime,
          result: activeTask.result,
          error: activeTask.error,
        };
      }
    }

    // 从数据库查询历史任务（支持按logId查询）
    const log = await this.prisma.crawlerLog.findFirst({
      where: { id: taskId },
    });
    if (!log) {
      throw new BadRequestException('任务不存在');
    }
    return {
      taskId: log.id,
      logId: log.id,
      status: log.status,
      universityId: log.universityId,
      itemsCount: log.itemsCount,
      errorMsg: log.errorMsg,
      createdAt: log.createdAt,
      startTime: log.startTime,
      endTime: log.endTime,
    };
  }

  /**
   * 生成任务ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var CrawlerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrawlerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const config_1 = require("@nestjs/config");
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
let CrawlerService = CrawlerService_1 = class CrawlerService {
    constructor(prisma, configService) {
        this.prisma = prisma;
        this.configService = configService;
        this.logger = new common_1.Logger(CrawlerService_1.name);
        this.activeTasks = new Map();
        this.crawlerPath = path.resolve(process.cwd(), '..', 'crawler');
    }
    async trigger(universityId, priority) {
        const runningTasks = Array.from(this.activeTasks.values()).filter(task => task.status === 'running');
        if (runningTasks.length > 0) {
            throw new common_1.BadRequestException('已有爬虫任务正在运行，请等待完成后再触发');
        }
        const taskId = this.generateTaskId();
        const log = await this.prisma.crawlerLog.create({
            data: {
                universityId: universityId || 'all',
                status: 'running',
                startTime: new Date(),
            },
        });
        const task = {
            id: taskId,
            logId: log.id,
            status: 'pending',
            universityId,
            priority,
        };
        this.activeTasks.set(taskId, task);
        this.executeCrawler(task);
        return {
            message: '爬虫任务已触发',
            taskId,
            logId: log.id,
            status: 'running',
        };
    }
    async executeCrawler(task) {
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
            await this.prisma.crawlerLog.update({
                where: { id: task.logId },
                data: {
                    status: 'success',
                    endTime: new Date(),
                    itemsCount: result.itemCount || 0,
                },
            });
            this.logger.log(`爬虫任务完成: ${task.id}`);
            this.scheduleTaskCleanup(task.id);
        }
        catch (error) {
            task.status = 'failed';
            task.endTime = new Date();
            task.error = error.message;
            await this.prisma.crawlerLog.update({
                where: { id: task.logId },
                data: {
                    status: 'failed',
                    endTime: new Date(),
                    errorMsg: error.message,
                },
            });
            this.logger.error(`爬虫任务失败: ${task.id}`, error.message);
            this.scheduleTaskCleanup(task.id);
        }
    }
    scheduleTaskCleanup(taskId) {
        setTimeout(() => {
            this.activeTasks.delete(taskId);
            this.logger.debug(`已清理完成任务: ${taskId}`);
        }, 60 * 60 * 1000);
    }
    runScrapyCommand(args) {
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
            const child = (0, child_process_1.spawn)(scrapyCmd, args, options);
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
                    const result = this.parseCrawlerOutput(stdout);
                    resolve(result);
                }
                else {
                    reject(new Error(`爬虫进程退出码: ${code}, 错误: ${stderr}`));
                }
            });
            child.on('error', (error) => {
                reject(new Error(`启动爬虫失败: ${error.message}`));
            });
            const timeoutHandle = setTimeout(() => {
                this.logger.warn(`爬虫任务超时，尝试终止进程: ${child.pid}`);
                child.kill('SIGTERM');
                setTimeout(() => {
                    if (!child.killed) {
                        this.logger.error(`爬虫进程未响应SIGTERM，强制终止: ${child.pid}`);
                        child.kill('SIGKILL');
                    }
                }, 5000);
            }, 30 * 60 * 1000);
            child.on('close', () => {
                clearTimeout(timeoutHandle);
            });
        });
    }
    parseCrawlerOutput(output) {
        const stats = {
            itemCount: 0,
            requestCount: 0,
            errorCount: 0,
        };
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
    async getLogs() {
        return this.prisma.crawlerLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
    }
    async getTaskStatus(taskId) {
        const task = this.activeTasks.get(taskId);
        if (!task) {
            const log = await this.prisma.crawlerLog.findFirst({
                where: { id: taskId },
            });
            if (!log) {
                throw new common_1.BadRequestException('任务不存在');
            }
            return {
                taskId: log.id,
                status: log.status,
                universityId: log.universityId,
                itemsCount: log.itemsCount,
                errorMsg: log.errorMsg,
                createdAt: log.createdAt,
                startTime: log.startTime,
                endTime: log.endTime,
            };
        }
        return {
            taskId: task.id,
            status: task.status,
            startTime: task.startTime,
            endTime: task.endTime,
            result: task.result,
            error: task.error,
        };
    }
    generateTaskId() {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
};
exports.CrawlerService = CrawlerService;
exports.CrawlerService = CrawlerService = CrawlerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], CrawlerService);
//# sourceMappingURL=crawler.service.js.map
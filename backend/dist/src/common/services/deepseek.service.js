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
var DeepSeekService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepSeekService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
let DeepSeekService = DeepSeekService_1 = class DeepSeekService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(DeepSeekService_1.name);
        this.dailyCallCount = 0;
        this.apiKey = this.configService.get('DEEPSEEK_API_KEY', '');
        this.apiUrl = this.configService.get('DEEPSEEK_API_URL', 'https://api.deepseek.com/v1');
        this.lastResetDate = new Date().toDateString();
    }
    async extractCampInfo(content, universityName) {
        if (!this.apiKey || this.apiKey === 'sk-placeholder') {
            this.logger.warn('DeepSeek API未配置，跳过智能提取');
            return null;
        }
        if (!this.checkQuota()) {
            this.logger.warn('DeepSeek API每日配额已用完');
            return null;
        }
        try {
            const prompt = this.buildExtractionPrompt(content, universityName);
            const response = await this.callDeepSeekAPI(prompt);
            if (response) {
                this.dailyCallCount++;
                return this.parseExtractionResult(response);
            }
            return null;
        }
        catch (error) {
            this.logger.error('DeepSeek API调用失败:', error.message);
            return null;
        }
    }
    buildExtractionPrompt(content, universityName) {
        return `请从以下${universityName}的夏令营招生信息中提取结构化数据。

内容：
${content.substring(0, 3000)}

请提取以下信息并以JSON格式返回：
{
  "title": "夏令营标题",
  "publishDate": "发布日期(YYYY-MM-DD格式)",
  "deadline": "截止日期(YYYY-MM-DD格式)",
  "startDate": "开始日期(YYYY-MM-DD格式)",
  "endDate": "结束日期(YYYY-MM-DD格式)",
  "requirements": {
    "gradeRank": "成绩排名要求",
    "english": "英语要求",
    "major": "专业要求",
    "other": "其他要求"
  },
  "materials": ["所需材料1", "所需材料2"],
  "process": ["流程步骤1", "流程步骤2"],
  "confidence": 0.95
}

注意：
1. 如果某项信息不存在，请使用null或空数组
2. confidence表示信息提取的置信度(0-1)
3. 日期必须使用YYYY-MM-DD格式
4. 只返回JSON，不要包含其他内容`;
    }
    async callDeepSeekAPI(prompt) {
        try {
            const response = await axios_1.default.post(`${this.apiUrl}/chat/completions`, {
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: '你是一个专门提取夏令营招生信息的助手。请准确提取信息并以JSON格式返回。',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.1,
                max_tokens: 2000,
            }, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 30000,
            });
            if (response.data.choices && response.data.choices.length > 0) {
                return response.data.choices[0].message.content;
            }
            return null;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                this.logger.error(`DeepSeek API错误: ${error.response?.status} - ${error.response?.data?.error?.message}`);
            }
            else {
                this.logger.error(`DeepSeek API异常: ${error.message}`);
            }
            return null;
        }
    }
    parseExtractionResult(content) {
        try {
            const jsonContent = content
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();
            const result = JSON.parse(jsonContent);
            if (!result.title) {
                this.logger.warn('提取结果缺少标题');
                return null;
            }
            return {
                title: result.title,
                publishDate: result.publishDate,
                deadline: result.deadline,
                startDate: result.startDate,
                endDate: result.endDate,
                requirements: result.requirements || {},
                materials: result.materials || [],
                process: result.process || [],
                confidence: result.confidence || 0.5,
            };
        }
        catch (error) {
            this.logger.error('解析提取结果失败:', error.message);
            return null;
        }
    }
    checkQuota() {
        const dailyLimit = this.configService.get('DEEPSEEK_DAILY_LIMIT', 400);
        const today = new Date().toDateString();
        if (today !== this.lastResetDate) {
            this.dailyCallCount = 0;
            this.lastResetDate = today;
        }
        return this.dailyCallCount < dailyLimit;
    }
    getQuotaStatus() {
        const dailyLimit = this.configService.get('DEEPSEEK_DAILY_LIMIT', 400);
        return {
            dailyLimit,
            used: this.dailyCallCount,
            remaining: dailyLimit - this.dailyCallCount,
            resetDate: this.lastResetDate,
        };
    }
};
exports.DeepSeekService = DeepSeekService;
exports.DeepSeekService = DeepSeekService = DeepSeekService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], DeepSeekService);
//# sourceMappingURL=deepseek.service.js.map
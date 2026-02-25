import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * DeepSeek API 响应接口
 */
interface DeepSeekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 夏令营信息提取结果
 */
export interface CampInfoExtraction {
  title: string;
  publishDate?: string;
  deadline?: string;
  startDate?: string;
  endDate?: string;
  requirements: {
    gradeRank?: string;
    english?: string;
    major?: string;
    other?: string;
  };
  materials: string[];
  process: string[];
  confidence: number;
}

/**
 * DeepSeek服务
 * 用于智能提取夏令营信息
 */
@Injectable()
export class DeepSeekService {
  private readonly logger = new Logger(DeepSeekService.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private dailyCallCount = 0;
  private lastResetDate: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('DEEPSEEK_API_KEY', '');
    this.apiUrl = this.configService.get<string>(
      'DEEPSEEK_API_URL',
      'https://api.deepseek.com/v1',
    );
    this.lastResetDate = new Date().toDateString();
  }

  /**
   * 从文本中提取夏令营信息
   * @param content 网页内容文本
   * @param universityName 院校名称
   * @returns 提取的夏令营信息
   */
  async extractCampInfo(
    content: string,
    universityName: string,
  ): Promise<CampInfoExtraction | null> {
    // 检查API配置
    if (!this.apiKey || this.apiKey === 'sk-placeholder') {
      this.logger.warn('DeepSeek API未配置，跳过智能提取');
      return null;
    }

    // 检查每日配额
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
    } catch (error) {
      this.logger.error('DeepSeek API调用失败:', error.message);
      return null;
    }
  }

  /**
   * 构建信息提取Prompt
   */
  private buildExtractionPrompt(
    content: string,
    universityName: string,
  ): string {
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

  /**
   * 调用DeepSeek API
   */
  private async callDeepSeekAPI(prompt: string): Promise<string | null> {
    try {
      const response = await axios.post<DeepSeekResponse>(
        `${this.apiUrl}/chat/completions`,
        {
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content:
                '你是一个专门提取夏令营招生信息的助手。请准确提取信息并以JSON格式返回。',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 2000,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      if (response.data.choices && response.data.choices.length > 0) {
        return response.data.choices[0].message.content;
      }

      return null;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `DeepSeek API错误: ${error.response?.status} - ${error.response?.data?.error?.message}`,
        );
      } else {
        this.logger.error(`DeepSeek API异常: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * 解析提取结果
   */
  private parseExtractionResult(content: string): CampInfoExtraction | null {
    try {
      // 清理Markdown代码块
      const jsonContent = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const result = JSON.parse(jsonContent);

      // 验证必要字段
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
    } catch (error) {
      this.logger.error('解析提取结果失败:', error.message);
      return null;
    }
  }

  /**
   * 检查API调用配额
   */
  private checkQuota(): boolean {
    const dailyLimit = this.configService.get<number>(
      'DEEPSEEK_DAILY_LIMIT',
      400,
    );
    const today = new Date().toDateString();

    // 重置每日计数
    if (today !== this.lastResetDate) {
      this.dailyCallCount = 0;
      this.lastResetDate = today;
    }

    return this.dailyCallCount < dailyLimit;
  }

  /**
   * 获取当前配额使用情况
   */
  getQuotaStatus(): {
    dailyLimit: number;
    used: number;
    remaining: number;
    resetDate: string;
  } {
    const dailyLimit = this.configService.get<number>(
      'DEEPSEEK_DAILY_LIMIT',
      400,
    );

    return {
      dailyLimit,
      used: this.dailyCallCount,
      remaining: dailyLimit - this.dailyCallCount,
      resetDate: this.lastResetDate,
    };
  }
}

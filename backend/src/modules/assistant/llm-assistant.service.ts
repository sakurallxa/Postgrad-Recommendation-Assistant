import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface StudentProfileForLlm {
  undergraduateSchool?: string;
  undergraduateMajor?: string;
  gpa?: string;
  gradeRankPercent?: number;
  gradeRankText?: string;
  englishStandardized?: string; // 如 "CET6:580" / "TOEFL:105"
  researchExperience?: string;
  competitionAwards?: string;
  targetMajors?: string[]; // 目标专业列表（核心字段）
  targetSchools?: string[]; // 目标学校列表（辅助参考）
}

export interface RequirementCheck {
  type: 'gpa' | 'english' | 'rank' | 'major' | 'award' | 'research' | 'school_tier' | 'other';
  requirement: string; // 原文要求
  userMatch: 'pass' | 'warn' | 'fail' | 'unknown';
  explanation: string;
}

export interface AssistantMatchResult {
  isRelevant: boolean;
  campType: 'summer_camp' | 'pre_recommendation' | null;
  matchesUserMajor: boolean;

  extractedTitle?: string;
  extractedDeadline?: string | null;
  extractedStartDate?: string | null;
  extractedEndDate?: string | null;
  extractedLocation?: string | null;
  extractedSummary?: string; // 1-2 句话

  keyRequirements: RequirementCheck[];

  overallRecommendation: 'recommend' | 'reference' | 'skip';
  matchScore?: number; // 0-100
  reasoning: string;

  llmModel?: string;
  llmTokensUsed?: number;
}

const SYSTEM_PROMPT = `你是一位**保研AI助理**，专门帮助大三/大四本科生从海量公告里筛选适合自己的夏令营/预推免机会。

你的核心任务：拿到一条公告原文 + 用户档案，输出一份**判断报告**。

判断报告必须严格按以下 JSON 格式输出，不要任何额外文字：

{
  "isRelevant": true/false,                  // 这条公告是不是真的夏令营/预推免/暑期学校招生（**不是**: 学校新闻/政策章程/已结束活动/录取名单等）
  "campType": "summer_camp"或"pre_recommendation"或null,
  "matchesUserMajor": true/false,            // 该公告面向的专业是否覆盖用户目标专业
  "extractedTitle": "公告标题（简短）",
  "extractedDeadline": "YYYY-MM-DDTHH:MM:SS" 或 null,
  "extractedStartDate": "YYYY-MM-DD" 或 null,    // 营期开始
  "extractedEndDate": "YYYY-MM-DD" 或 null,      // 营期结束
  "extractedLocation": "举办地点" 或 null,
  "extractedSummary": "1-2句话描述这个机会（学校/院系/形式/亮点）",
  "keyRequirements": [
    {
      "type": "gpa"或"english"或"rank"或"major"或"award"或"research"或"school_tier"或"other",
      "requirement": "原文要求（如'GPA 3.5+'）",
      "userMatch": "pass"/"warn"/"fail"/"unknown",
      "explanation": "1句话解释为什么（'你 GPA 3.85 高于 3.5'）"
    }
  ],
  "overallRecommendation": "recommend"或"reference"或"skip",
  "matchScore": 0-100 的整数,
  "reasoning": "1-2句话总结建议"
}

**判断规则**：
1. isRelevant=false 的场景：政策章程、新闻报道、过去活动总结、录取/复试名单、招生计划表、博士招生（无推免/夏令营信息）
2. matchesUserMajor 优先判断：用户的目标专业是否被公告覆盖。如果完全不沾边，matchScore 不超过 30。
3. userMatch 评估：
   - pass: 用户档案明确满足该要求
   - warn: 接近边界（如要求GPA 3.5、用户 3.48）或档案信息不足以判断
   - fail: 明确不满足（如要求专业前 10%，用户 14%）
   - unknown: 公告里没明确要求该项 / 用户档案没填该项
4. overallRecommendation:
   - recommend: 大部分要求 pass，matchScore>=70
   - reference: 部分关键项 fail 但仍有价值看看
   - skip: 专业不匹配 OR 多个硬性要求 fail OR isRelevant=false
5. **严格基于公告原文 + 用户档案，不要编造**
6. **不要输出 markdown 代码块**，直接输出 JSON 对象
`;

@Injectable()
export class LlmAssistantService {
  private readonly logger = new Logger(LlmAssistantService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.apiUrl =
      this.configService.get<string>('DEEPSEEK_API_URL') ||
      'https://api.deepseek.com/v1';
    this.apiKey = this.configService.get<string>('DEEPSEEK_API_KEY') || '';
    this.model = this.configService.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat';
  }

  /**
   * 主接口：给公告原文+用户档案，返回匹配判断
   */
  async analyzeCampForUser(
    rawContent: string,
    profile: StudentProfileForLlm,
    options: { sourceUrl?: string; existingTitle?: string } = {},
  ): Promise<AssistantMatchResult | null> {
    if (!this.apiKey) {
      this.logger.error('DEEPSEEK_API_KEY 未配置');
      return null;
    }
    if (!rawContent || rawContent.trim().length < 30) {
      this.logger.warn('原文过短，跳过 LLM 调用');
      return null;
    }

    const trimmedContent = rawContent.slice(0, 6000);
    const userPrompt = this.buildUserPrompt(trimmedContent, profile, options);

    try {
      const start = Date.now();
      const response = await axios.post(
        `${this.apiUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 1500,
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        },
      );

      const elapsed = Date.now() - start;
      const choice = response.data?.choices?.[0]?.message?.content;
      const usage = response.data?.usage;

      if (!choice) {
        this.logger.warn('LLM 返回空内容');
        return null;
      }

      const parsed = this.parseLlmOutput(choice);
      if (!parsed) return null;

      parsed.llmModel = this.model;
      parsed.llmTokensUsed = (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0);

      this.logger.log(
        `[LLM] ${elapsed}ms tokens=${parsed.llmTokensUsed} recommendation=${parsed.overallRecommendation} score=${parsed.matchScore}`,
      );

      return parsed;
    } catch (error: any) {
      const msg = axios.isAxiosError(error)
        ? `${error.response?.status}: ${JSON.stringify(error.response?.data).slice(0, 200)}`
        : error.message;
      this.logger.error(`LLM 调用失败: ${msg}`);
      return null;
    }
  }

  private buildUserPrompt(
    content: string,
    profile: StudentProfileForLlm,
    options: { sourceUrl?: string; existingTitle?: string },
  ): string {
    const profileLines: string[] = ['=== 用户档案 ==='];
    profileLines.push(`本科学校：${profile.undergraduateSchool || '未填写'}`);
    profileLines.push(`本科专业：${profile.undergraduateMajor || '未填写'}`);
    profileLines.push(`GPA：${profile.gpa || '未填写'}`);
    if (profile.gradeRankPercent != null) {
      profileLines.push(`专业排名：${profile.gradeRankPercent}%`);
    } else if (profile.gradeRankText) {
      profileLines.push(`专业排名：${profile.gradeRankText}`);
    }
    if (profile.englishStandardized) {
      profileLines.push(`英语：${profile.englishStandardized}`);
    }
    if (profile.researchExperience) {
      profileLines.push(`科研经历：${profile.researchExperience}`);
    }
    if (profile.competitionAwards) {
      profileLines.push(`竞赛奖项：${profile.competitionAwards}`);
    }
    if (profile.targetMajors?.length) {
      profileLines.push(`**目标专业（重要）**：${profile.targetMajors.join('、')}`);
    } else {
      profileLines.push('**目标专业**：（用户未明确指定）');
    }

    const meta = options.existingTitle ? `已知标题：${options.existingTitle}` : '';
    return [
      profileLines.join('\n'),
      '',
      '=== 公告原文 ===',
      options.sourceUrl ? `来源：${options.sourceUrl}` : '',
      meta,
      content,
      '',
      '请按 system 中规定的 JSON 格式输出判断结果。',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private parseLlmOutput(content: string): AssistantMatchResult | null {
    try {
      const cleaned = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const parsed = JSON.parse(cleaned);

      // 字段校验+归一
      const result: AssistantMatchResult = {
        isRelevant: Boolean(parsed.isRelevant),
        campType: ['summer_camp', 'pre_recommendation'].includes(parsed.campType)
          ? parsed.campType
          : null,
        matchesUserMajor: Boolean(parsed.matchesUserMajor),
        extractedTitle: parsed.extractedTitle || undefined,
        extractedDeadline: parsed.extractedDeadline || null,
        extractedStartDate: parsed.extractedStartDate || null,
        extractedEndDate: parsed.extractedEndDate || null,
        extractedLocation: parsed.extractedLocation || null,
        extractedSummary: parsed.extractedSummary || undefined,
        keyRequirements: Array.isArray(parsed.keyRequirements)
          ? parsed.keyRequirements
              .filter((r: any) => r && typeof r === 'object')
              .slice(0, 8)
              .map((r: any) => ({
                type: r.type || 'other',
                requirement: String(r.requirement || ''),
                userMatch: ['pass', 'warn', 'fail', 'unknown'].includes(r.userMatch)
                  ? r.userMatch
                  : 'unknown',
                explanation: String(r.explanation || ''),
              }))
          : [],
        overallRecommendation: ['recommend', 'reference', 'skip'].includes(
          parsed.overallRecommendation,
        )
          ? parsed.overallRecommendation
          : 'reference',
        matchScore:
          typeof parsed.matchScore === 'number'
            ? Math.max(0, Math.min(100, Math.round(parsed.matchScore)))
            : undefined,
        reasoning: String(parsed.reasoning || ''),
      };

      // isRelevant=false 时强制 skip
      if (!result.isRelevant) {
        result.overallRecommendation = 'skip';
        result.matchScore = result.matchScore ?? 0;
      }

      return result;
    } catch (error: any) {
      this.logger.error(`LLM 输出解析失败: ${error.message}, raw=${content.slice(0, 200)}`);
      return null;
    }
  }
}

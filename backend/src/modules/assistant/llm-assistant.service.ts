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
  // ⚠ 严格区分以下 3 个时间字段，绝不能混淆：
  "extractedDeadline": "YYYY-MM-DDTHH:MM:SS" 或 null,  // 【报名/申请 截止时间】(通常公告里写"报名截止"、"申请截止"、"网申截止")
  "extractedStartDate": "YYYY-MM-DD" 或 null,  // 【夏令营/活动 实际开始日期】(公告里写"活动时间"、"营期"、"举办时间"、"报到时间")，**不是** 报名开始时间
  "extractedEndDate": "YYYY-MM-DD" 或 null,    // 【夏令营/活动 实际结束日期】，**不是** 报名截止时间
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
3. userMatch 评估（严格按以下规则，**不要主观软化**）：
   - pass: 用户档案明确满足该要求
   - warn: 接近边界（如要求 GPA 3.5、用户 3.48）
   - **fail: 用户档案有该字段但明确不满足要求**（例：公告要"生命科学专业"，用户本科专业是"工业设计" → 必须 fail，绝不可以 unknown）
   - unknown: 仅当"用户档案该字段确实为空（值为'未填写'）"或"公告没明确要求该项"时使用
4. **explanation 写作铁律**：
   - 用户档案"本科专业"字段不是"未填写"时，**严禁**输出"用户未填写本科专业"之类的话
   - 用户档案有值但与要求不符 → 必须明说差异（例："用户本科专业是工业设计，与公告要求的生命科学方向不符"）
   - 同理 GPA / 排名 / 英语 / 学校层次 等字段，档案有值就要正面引用真实值
5. overallRecommendation:
   - recommend: 大部分要求 pass，matchScore>=70
   - reference: 部分关键项 fail 但仍有价值看看
   - skip: 专业不匹配 OR 多个硬性要求 fail OR isRelevant=false
6. **严格基于公告原文 + 用户档案，不要编造，不要无视档案里实际存在的字段**
7. **时间字段提取铁律**（这是高频出错点，特别注意）：
   - extractedDeadline = 报名截止 / 申请截止 / 网申截止（用户**最后能交资料**的时间点）
   - extractedStartDate / extractedEndDate = **夏令营/暑期学校/培训班的实际举办期间**（用户**人到学校**的日期段，关键字：营期/活动时间/举办时间/报到时间/培训日期）
   - **典型错误**：把"报名时间 4 月 28 日 ~ 5 月 31 日"误识别为营期 → 错误！这是报名期间。营期是单独的"活动时间 7 月 6 日 ~ 7 月 10 日"
   - 如果原文只有报名时间没有明确营期 → extractedStartDate/extractedEndDate 设为 null（不要硬猜）
   - 营期一般在报名截止之后（如报名截止 5 月、营期 7 月）；如果你提取的 startDate <= deadline，**几乎肯定提错了**
8. **不要输出 markdown 代码块**，直接输出 JSON 对象
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
    // Mock fallback：开发环境（ALLOW_MOCK_WECHAT_LOGIN=true）或未配 API key 时走本地 mock
    const isMockMode =
      !this.apiKey ||
      this.apiKey.startsWith('sk-placeholder') ||
      this.apiKey === 'mock' ||
      this.configService.get<string>('ALLOW_MOCK_WECHAT_LOGIN') === 'true';
    if (isMockMode) {
      this.logger.warn('启用 mock LLM 模式（ALLOW_MOCK_WECHAT_LOGIN=true 或未配 API key）');
      return this.buildMockResult(rawContent, profile, options);
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
    // 显式列出"已填字段"清单，让 LLM 无法忽略
    const filledFields: string[] = [];
    if (profile.undergraduateSchool) filledFields.push('本科学校');
    if (profile.undergraduateMajor) filledFields.push('本科专业');
    if (profile.gpa) filledFields.push('GPA');
    if (profile.gradeRankPercent != null || profile.gradeRankText) filledFields.push('专业排名');
    if (profile.englishStandardized) filledFields.push('英语');
    if (profile.researchExperience) filledFields.push('科研经历');
    if (profile.competitionAwards) filledFields.push('竞赛奖项');
    if (profile.targetMajors?.length) filledFields.push('目标专业');
    profileLines.push(`【已填字段清单】${filledFields.length ? filledFields.join('、') : '（无）'}`);
    profileLines.push(`⚠ 上述清单内的字段在评估 keyRequirements 时必须使用真实值，不可输出"未填写"。`);
    profileLines.push('');
    profileLines.push(`本科学校：${profile.undergraduateSchool || '未填写'}`);
    profileLines.push(`本科专业：${profile.undergraduateMajor || '未填写'}`);
    profileLines.push(`GPA：${profile.gpa || '未填写'}`);
    if (profile.gradeRankPercent != null) {
      profileLines.push(`专业排名：${profile.gradeRankPercent}%`);
    } else if (profile.gradeRankText) {
      profileLines.push(`专业排名：${profile.gradeRankText}`);
    } else {
      profileLines.push('专业排名：未填写');
    }
    profileLines.push(`英语：${profile.englishStandardized || '未填写'}`);
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

      // 字段校验+归一 + 营期 sanity check
      // 兜底：如果 LLM 把"报名期间"当成营期（startDate <= deadline 或 endDate <= deadline），
      //       几乎肯定是误识别（营期一般在报名截止之后），清空避免显示错误
      const deadlineMs = parsed.extractedDeadline ? Date.parse(parsed.extractedDeadline) : NaN;
      const startMs = parsed.extractedStartDate ? Date.parse(parsed.extractedStartDate) : NaN;
      const endMs = parsed.extractedEndDate ? Date.parse(parsed.extractedEndDate) : NaN;
      let safeStartDate = parsed.extractedStartDate || null;
      let safeEndDate = parsed.extractedEndDate || null;
      if (Number.isFinite(deadlineMs) && Number.isFinite(endMs) && endMs <= deadlineMs) {
        this.logger.warn(
          `[parse] 营期结束(${parsed.extractedEndDate}) <= 报名截止(${parsed.extractedDeadline})，疑似误识别为报名期，清空 startDate/endDate`,
        );
        safeStartDate = null;
        safeEndDate = null;
      } else if (
        Number.isFinite(deadlineMs) &&
        Number.isFinite(startMs) &&
        startMs <= deadlineMs &&
        // 同时缺失 endDate 或 endDate 也 <= deadline 才清，避免误伤"营期跨报名截止"的少数特殊情况
        (!Number.isFinite(endMs) || endMs <= deadlineMs)
      ) {
        this.logger.warn(
          `[parse] 营期开始(${parsed.extractedStartDate}) <= 报名截止(${parsed.extractedDeadline})，清空 startDate/endDate`,
        );
        safeStartDate = null;
        safeEndDate = null;
      }

      const result: AssistantMatchResult = {
        isRelevant: Boolean(parsed.isRelevant),
        campType: ['summer_camp', 'pre_recommendation'].includes(parsed.campType)
          ? parsed.campType
          : null,
        matchesUserMajor: Boolean(parsed.matchesUserMajor),
        extractedTitle: parsed.extractedTitle || undefined,
        extractedDeadline: parsed.extractedDeadline || null,
        extractedStartDate: safeStartDate,
        extractedEndDate: safeEndDate,
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

  /**
   * Mock 模式：DEEPSEEK_API_KEY 未配置时返回逼真的匹配结果。
   * 让前端"手动测试 AI 助理"入口在开发模式下也能跑。
   */
  private buildMockResult(
    rawContent: string,
    profile: StudentProfileForLlm,
    options: { sourceUrl?: string; existingTitle?: string },
  ): AssistantMatchResult {
    const isPreRec = /预推免|推免|推荐免试/.test(rawContent + (options.existingTitle || ''));
    const campType = isPreRec ? 'pre_recommendation' : 'summer_camp';
    const title =
      options.existingTitle ||
      (rawContent.split('\n').find((l) => l.trim().length > 5 && l.trim().length < 60) || '').trim() ||
      '示例公告';

    // 模拟根据 profile 做匹配
    const userMajorsArr = profile?.targetMajors || [];
    const userMajors = userMajorsArr.join(',');
    const hasResearch = !!profile?.researchExperience && profile.researchExperience.length > 10;
    const hasAward = !!profile?.competitionAwards && profile.competitionAwards.length > 5;
    const gpaNum = parseFloat(profile?.gpa || '0') || 0;
    const englishStr = profile?.englishStandardized || ''; // "CET6:568"
    const englishScoreMatch = englishStr.match(/(\d{3,4})/);
    const englishScore = englishScoreMatch ? parseInt(englishScoreMatch[1], 10) : 0;
    const englishOk = englishScore >= 425;
    const schoolStr = profile?.undergraduateSchool || '';
    const isTier985Or211 = /985|211/.test(schoolStr);

    // === 真正的专业匹配判断 ===
    // 从 rawContent + title 里提取公告招生方向，与用户 targetMajors 比对
    const campText = `${title}\n${rawContent.slice(0, 3000)}`;
    const userMajorHits: string[] = [];
    for (const m of userMajorsArr) {
      // 完全匹配 或 关键字部分匹配
      if (campText.includes(m)) {
        userMajorHits.push(m);
        continue;
      }
      // 部分关键字（去掉"科学与技术"等后缀）
      const stem = m.replace(/科学与技术|工程|学|与技术|科学/g, '').trim();
      if (stem.length >= 2 && campText.includes(stem)) {
        userMajorHits.push(m);
      }
    }
    // 公告招生大领域关键字（用于反查"无关"）
    const campIsEngineering = /工科|工学|理工|计算机|电子|信息|通信|机械|能源|材料|化学|物理|建筑|生物医学/.test(campText);
    const userIsEngineering =
      userMajorsArr.length > 0 &&
      userMajorsArr.some((m) => /计算机|电子|信息|通信|机械|自动化|材料|化学|物理|工程|建筑|能源|生物医学/.test(m));
    const userIsLiberal =
      userMajorsArr.length > 0 &&
      userMajorsArr.some((m) => /文学|历史|哲学|社会|经济|管理|法学|教育|心理|新闻|设计|艺术/.test(m));

    // matchesUserMajor 真实判断
    const majorMatches = userMajorHits.length > 0;
    const majorClearlyMismatch = !majorMatches && campIsEngineering && userIsLiberal;

    // 综合评分（专业占主导）
    let score = 50;
    if (gpaNum >= 3.5) score += 12;
    if (englishOk) score += 8;
    if (hasResearch) score += 10;
    if (hasAward) score += 6;
    if (majorMatches) score += 18; // 专业匹配 +18
    else if (majorClearlyMismatch) score -= 30; // 文转工/工转文 -30
    else score -= 8; // 不确定 -8
    score = Math.max(10, Math.min(95, score));
    const rec: 'recommend' | 'reference' | 'skip' =
      majorClearlyMismatch ? 'skip'
      : score >= 75 ? 'recommend'
      : score >= 45 ? 'reference'
      : 'skip';

    const requirements: RequirementCheck[] = [
      {
        type: 'rank',
        requirement: '本科前三年专业排名前 30%',
        userMatch: gpaNum >= 3.5 ? 'pass' : gpaNum > 0 ? 'warn' : 'unknown',
        explanation: gpaNum >= 3.5
          ? `你 GPA ${gpaNum}，估算排名靠前。`
          : gpaNum > 0
          ? `你 GPA ${gpaNum}，建议补充专业排名。`
          : '档案未填写 GPA / 排名。',
      },
      {
        type: 'english',
        requirement: 'CET-6 ≥ 425（或 TOEFL 90+）',
        userMatch: englishOk ? 'pass' : englishScore > 0 ? 'warn' : 'unknown',
        explanation: englishOk
          ? `你 ${englishStr}，达标。`
          : englishScore > 0
          ? `你 ${englishStr}，未达 425。`
          : '档案未填写英语成绩。',
      },
      {
        type: 'major',
        requirement: '公告招生方向（基于原文识别）',
        userMatch: majorMatches ? 'pass' : majorClearlyMismatch ? 'fail' : userMajors ? 'warn' : 'unknown',
        explanation: majorMatches
          ? `你的目标专业 ${userMajorHits.join('、')} 与公告招生方向匹配。`
          : majorClearlyMismatch
          ? `你的目标专业（${userMajors}）与公告招生方向不匹配。`
          : userMajors
          ? `你的目标专业（${userMajors}）与公告招生方向可能相关但不直接匹配，建议查看原文确认。`
          : '档案未填写目标专业，无法判断匹配度。',
      },
      {
        type: 'research',
        requirement: '具有科研经历（优先）',
        userMatch: hasResearch ? 'pass' : 'warn',
        explanation: hasResearch
          ? '你列出了科研经历，可在个人陈述中重点描述。'
          : '档案未填写科研经历，建议补充。',
      },
      {
        type: 'award',
        requirement: '学科竞赛获奖（优先）',
        userMatch: hasAward ? 'pass' : 'warn',
        explanation: hasAward ? '你列出了竞赛获奖，加分项。' : '档案未填写竞赛获奖。',
      },
      {
        type: 'school_tier',
        requirement: '本科为 985/211 高校',
        userMatch: isTier985Or211 ? 'pass' : 'warn',
        explanation: schoolStr
          ? `你本科：${schoolStr}`
          : '档案未填写本科学校。',
      },
    ];

    // 根据 rawContent 尽量抽取截止日
    let extractedDeadline: string | null = null;
    const dateMatch = rawContent.match(/(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})/);
    if (dateMatch) {
      const [_, y, m, d] = dateMatch;
      extractedDeadline = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T23:59:59`;
    } else {
      // 默认 30 天后
      const dt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
      extractedDeadline = dt.toISOString();
    }

    return {
      isRelevant: true,
      campType,
      // 真实专业匹配判断，不再简单跟 rec 绑定
      matchesUserMajor: majorMatches,
      extractedTitle: title.slice(0, 80),
      extractedDeadline,
      extractedStartDate: null,
      extractedEndDate: null,
      extractedLocation: '（mock）线下 + 线上',
      extractedSummary:
        rec === 'recommend'
          ? `该${isPreRec ? '预推免' : '夏令营'}与你的档案高度匹配，建议优先准备。`
          : rec === 'reference'
          ? `部分条件匹配，可作为备选关注。建议优先冲击更高匹配的机会。`
          : `与你目标方向偏差较大，建议跳过。`,
      keyRequirements: requirements,
      overallRecommendation: rec,
      matchScore: score,
      reasoning:
        majorClearlyMismatch
          ? `你的专业（${userMajors || '未填写'}）与公告招生方向（${campIsEngineering ? '理工科' : '通用'}）差异较大，匹配度低，建议跳过。`
          : !majorMatches && userMajors
          ? `你的专业（${userMajors}）与公告招生方向不完全匹配，但可能相关，建议查看原文确认是否在招生范围内。`
          : rec === 'recommend'
          ? `你 GPA + 英语 + 科研三项均过线，且专业 ${userMajorHits.join('、')} 匹配，建议作为重点目标。`
          : rec === 'reference'
          ? '部分硬性条件偏弱，但仍有机会，建议在投递清单中备选。'
          : '硬性条件多项未达，建议把精力投放更匹配的营。',
      llmModel: 'mock-v0 (无 API key)',
      llmTokensUsed: 0,
    };
  }
}

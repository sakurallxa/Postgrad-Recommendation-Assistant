import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { DeepSeekService } from '../src/common/services/deepseek.service';
import { CrawlerService } from '../src/modules/crawler/crawler.service';

const backendRoot = path.resolve(__dirname, '..');
const envCandidates = [
  path.join(backendRoot, '.env'),
  path.join(backendRoot, '.env.production'),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
const allArg = process.argv.includes('--all');
const idArg = process.argv.find((arg) => arg.startsWith('--ids='));
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const explicitIds = idArg
  ? idArg
      .slice('--ids='.length)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  : [];
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : 10;

const SUSPICIOUS_PROCESS_PATTERNS = [
  '符合申请条件的申请者登录',
  '正式录取通知书将于',
  'http://yz.chsi.com.cn/tm',
  '点击此处登录',
  '推免招生简章要求及推免复试考核结果',
];

function hasMojibake(text: string | null | undefined): boolean {
  const value = String(text || '');
  if (!value.trim()) {
    return false;
  }
  return /[�]|[ÃÅÆÐØÙÚÛÜÝÞßðñòóôõö÷øùúûüýþÿ]/.test(value) || /[\uFFFD]/.test(value);
}

function hasBreadcrumbTitle(text: string | null | undefined): boolean {
  return /当前位置|首页\s*>/.test(String(text || ''));
}

function serializeStructured(value: any): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return JSON.stringify(value);
}

function parseStructured(value: string | null | undefined, fallback: any) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toDate(value?: string | null) {
  if (!value) {
    return null;
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    return null;
  }
  return dt;
}

function runPythonExtract(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonCommand =
      process.platform === 'win32'
        ? path.join(backendRoot, '..', 'crawler', '.venv', 'Scripts', 'python.exe')
        : 'python3';
    const child = spawn(pythonCommand, args, {
      cwd: backendRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `python_extract_failed:${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`python_extract_parse_failed:${error instanceof Error ? error.message : String(error)}`));
      }
    });
  });
}

async function fetchSourceReachable(sourceUrl: string) {
  try {
    await axios.head(sourceUrl, {
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      },
    });
    return true;
  } catch {
    return false;
  }
}

function hasStructuredProcessObjects(value: any): boolean {
  return Array.isArray(value) && value.some((item) => item && typeof item === 'object' && !Array.isArray(item));
}

function hasStructuredMojibake(value: any): boolean {
  return hasMojibake(serializeStructured(value));
}

async function main() {
  const configService = new ConfigService(process.env);
  const deepSeekService = new DeepSeekService(configService);
  const crawlerService = new CrawlerService(prisma as any, configService, {} as any, deepSeekService);

  const candidates = explicitIds.length > 0
    ? await prisma.campInfo.findMany({
        where: { id: { in: explicitIds } },
        include: {
          university: { select: { name: true } },
        },
      })
    : allArg
    ? await prisma.campInfo.findMany({
        where: {
          sourceUrl: { not: '' },
        },
        include: {
          university: { select: { name: true } },
        },
        take: Number.isFinite(limit) && limit > 0 ? limit : 100,
        orderBy: { updatedAt: 'desc' },
      })
    : await prisma.campInfo.findMany({
        where: {
          OR: SUSPICIOUS_PROCESS_PATTERNS.map((pattern) => ({
            process: { contains: pattern },
          })),
        },
        include: {
          university: { select: { name: true } },
        },
        take: Number.isFinite(limit) && limit > 0 ? limit : 10,
        orderBy: { updatedAt: 'desc' },
      });

  const summary = {
    dryRun,
    scanned: candidates.length,
    updated: 0,
    skipped: 0,
    failed: 0,
    llmSuccess: 0,
    sanitizedOnly: 0,
  };

  for (const camp of candidates) {
    const universityName = camp.university?.name || camp.universityId;
    try {
      const reachable = await fetchSourceReachable(camp.sourceUrl);
      if (!reachable) {
        summary.skipped += 1;
        console.log(`[skip] id=${camp.id} reason=source_unreachable url=${camp.sourceUrl}`);
        continue;
      }

      const extracted = await runPythonExtract([
        path.join(backendRoot, 'scripts', 'extract-camp-page.py'),
        camp.sourceUrl,
        universityName,
        camp.title,
      ]);
      const normalizedExtractedTitle =
        typeof extracted.title === 'string' ? extracted.title.trim() : '';
      const currentRawContent = typeof camp.rawContent === 'string' ? camp.rawContent.trim() : '';
      const nextRawContent = typeof extracted.content === 'string' ? extracted.content.trim() : '';
      const rawContentImproved = Boolean(nextRawContent) && nextRawContent !== currentRawContent;
      const titleImproved =
        Boolean(normalizedExtractedTitle) &&
        normalizedExtractedTitle !== camp.title &&
        (hasMojibake(camp.title) || hasBreadcrumbTitle(camp.title));
      const currentRequirements = parseStructured(camp.requirements, {});
      const currentMaterials = parseStructured(camp.materials, []);
      const currentProcess = parseStructured(camp.process, []);
      const currentProcessLowQuality = (crawlerService as any).hasLowQualityProcess(currentProcess);
      const clearLowQualityProcess = Boolean(currentRawContent || nextRawContent) && currentProcessLowQuality;
      const clearMojibakeRequirements = hasStructuredMojibake(camp.requirements);
      const clearMojibakeMaterials = hasStructuredMojibake(camp.materials);
      const clearMojibakeProcess = hasStructuredMojibake(camp.process);
      const hasSanitizeOnlyFix =
        clearLowQualityProcess || clearMojibakeRequirements || clearMojibakeMaterials || clearMojibakeProcess;

      const fallbackResult = await (crawlerService as any).applyDeepSeekFallback(
        {
          title: normalizedExtractedTitle || camp.title,
          sourceUrl: camp.sourceUrl,
          universityId: camp.universityId,
          universityName,
          announcementType: camp.announcementType,
          content: extracted.content || '',
          requirements: extracted.requirements || {},
          materials: extracted.materials || [],
          process: extracted.process || [],
          contact: parseStructured(camp.contact, {}),
          location: camp.location || '',
          confidence: camp.confidence || 0.8,
        },
        { llmTriggered: 0, llmCompared: 0, llmMerged: 0, llmSuccess: 0, llmFailed: 0 },
      );

      if (!fallbackResult.used || !fallbackResult.success) {
        if (rawContentImproved || titleImproved || hasSanitizeOnlyFix) {
          const updateData: any = {};
          if (rawContentImproved) {
            updateData.rawContent = nextRawContent;
          }
          if (titleImproved) {
            updateData.title = normalizedExtractedTitle;
          }
          if (clearLowQualityProcess || clearMojibakeProcess) {
            updateData.process = null;
          }
          if (clearMojibakeRequirements) {
            updateData.requirements = null;
          }
          if (clearMojibakeMaterials) {
            updateData.materials = null;
          }
          if (!dryRun) {
            await prisma.campInfo.update({
              where: { id: camp.id },
              data: updateData,
            });
          }
          summary.updated += 1;
          if (hasSanitizeOnlyFix && !rawContentImproved && !titleImproved) {
            summary.sanitizedOnly += 1;
          }
          const reasonParts = [];
          if (rawContentImproved) {
            reasonParts.push('raw_content_only');
          }
          if (titleImproved) {
            reasonParts.push('title_only');
          }
          if (clearLowQualityProcess) {
            reasonParts.push('clear_low_quality_process');
          }
          if (clearMojibakeRequirements) {
            reasonParts.push('clear_mojibake_requirements');
          }
          if (clearMojibakeMaterials) {
            reasonParts.push('clear_mojibake_materials');
          }
          if (clearMojibakeProcess) {
            reasonParts.push('clear_mojibake_process');
          }
          console.log(
            `[camp] ${dryRun ? 'would-update' : 'updated'} id=${camp.id} title=${JSON.stringify(titleImproved ? normalizedExtractedTitle : camp.title)} reasons=${reasonParts.join('|') || 'sanitize_only'} details=${fallbackResult.error || fallbackResult.reasons.join('|')}`,
          );
          continue;
        }
        summary.skipped += 1;
        console.log(
          `[skip] id=${camp.id} reason=fallback_not_applied details=${fallbackResult.error || fallbackResult.reasons.join('|')}`,
        );
        continue;
      }

      const next = fallbackResult.item;
      const nextProcessLowQuality = (crawlerService as any).hasLowQualityProcess(next.process);
      const processImproved =
        serializeStructured(currentProcess) !== serializeStructured(next.process) &&
        (hasStructuredProcessObjects(next.process) || !nextProcessLowQuality);
      if (currentProcessLowQuality && !processImproved && !rawContentImproved) {
        if (clearLowQualityProcess || clearMojibakeRequirements || clearMojibakeMaterials || clearMojibakeProcess) {
          const sanitizeData: any = {};
          if (clearLowQualityProcess || clearMojibakeProcess) {
            sanitizeData.process = null;
          }
          if (clearMojibakeRequirements) {
            sanitizeData.requirements = null;
          }
          if (clearMojibakeMaterials) {
            sanitizeData.materials = null;
          }
          if (!dryRun) {
            await prisma.campInfo.update({
              where: { id: camp.id },
              data: sanitizeData,
            });
          }
          summary.updated += 1;
          summary.sanitizedOnly += 1;
          console.log(
            `[camp] ${dryRun ? 'would-update' : 'updated'} id=${camp.id} title=${JSON.stringify(camp.title)} reasons=sanitize_only details=next_process_still_low_quality_and_raw_content_unchanged`,
          );
          continue;
        }
        summary.skipped += 1;
        console.log(
          `[skip] id=${camp.id} reason=no_quality_gain details=next_process_still_low_quality_and_raw_content_unchanged`,
        );
        continue;
      }

      const data = {
        title: next.title || camp.title,
        announcementType: next.announcementType || camp.announcementType,
        publishDate: toDate(next.publishDate),
        deadline: toDate(next.deadline),
        startDate: toDate(next.startDate),
        endDate: toDate(next.endDate),
        location: typeof next.location === 'string' && next.location.trim() ? next.location.trim() : null,
        requirements: serializeStructured(next.requirements),
        materials: serializeStructured(next.materials),
        process: serializeStructured(next.process),
        contact: serializeStructured(next.contact),
        rawContent: nextRawContent || null,
        confidence: typeof next.confidence === 'number' ? next.confidence : camp.confidence,
      };

      if (!dryRun) {
        await prisma.campInfo.update({
          where: { id: camp.id },
          data,
        });
      }

      summary.updated += 1;
      summary.llmSuccess += 1;
      console.log(
        `[camp] ${dryRun ? 'would-update' : 'updated'} id=${camp.id} title=${JSON.stringify(data.title)} reasons=${fallbackResult.reasons.join('|')} processImproved=${processImproved} rawContentImproved=${rawContentImproved}`,
      );
    } catch (error) {
      summary.failed += 1;
      console.error(
        `[failed] id=${camp.id} url=${camp.sourceUrl} error=${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error('reextract-low-quality-camps failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const backendRoot = path.resolve(__dirname, '..');
for (const envPath of [path.join(backendRoot, '.env'), path.join(backendRoot, '.env.production')]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

const prisma = new PrismaClient();
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : 500;

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

function isLowQualityProcess(text: string | null | undefined): boolean {
  return /申请条件|申请、考核及录取程序|正式录取通知书将于|http:\/\/yz\.chsi\.com\.cn\/tm/.test(String(text || ''));
}

async function main() {
  const rows = await prisma.campInfo.findMany({
    select: {
      id: true,
      title: true,
      requirements: true,
      materials: true,
      process: true,
      rawContent: true,
      updatedAt: true,
    },
    take: Number.isFinite(limit) && limit > 0 ? limit : 500,
    orderBy: { updatedAt: 'desc' },
  });

  const mojibakeTitle = rows.filter((row) => hasMojibake(row.title));
  const breadcrumbTitle = rows.filter((row) => hasBreadcrumbTitle(row.title));
  const mojibakeStructured = rows.filter(
    (row) =>
      hasMojibake(row.requirements) ||
      hasMojibake(row.materials) ||
      hasMojibake(row.process),
  );
  const lowStructuredWithRaw = rows.filter(
    (row) => Boolean(row.rawContent) && isLowQualityProcess(row.process),
  );

  console.log(
    JSON.stringify(
      {
        scanned: rows.length,
        counts: {
          mojibakeTitle: mojibakeTitle.length,
          breadcrumbTitle: breadcrumbTitle.length,
          mojibakeStructured: mojibakeStructured.length,
          lowStructuredWithRaw: lowStructuredWithRaw.length,
        },
        mojibakeTitle: mojibakeTitle.slice(0, 20).map((row) => ({ id: row.id, title: row.title })),
        breadcrumbTitle: breadcrumbTitle.slice(0, 20).map((row) => ({ id: row.id, title: row.title })),
        mojibakeStructured: mojibakeStructured.slice(0, 20).map((row) => ({ id: row.id, title: row.title })),
        lowStructuredWithRaw: lowStructuredWithRaw.slice(0, 20).map((row) => ({ id: row.id, title: row.title })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error('audit-camp-data-quality failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

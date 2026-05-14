import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
const overwrite = process.argv.includes('--overwrite');

const UNIVERSITY_LOGO_MAP: Array<{
  name?: string;
  websiteIncludes?: string;
  logo: string;
}> = [
  {
    name: '清华大学',
    websiteIncludes: 'tsinghua.edu.cn',
    logo: 'https://www.tsinghua.edu.cn/image/logo180.png',
  },
  {
    name: '北京大学',
    websiteIncludes: 'pku.edu.cn',
    logo: 'https://www.pku.edu.cn/Uploads/Picture/2019/12/26/s5e04176fbbfa3.png',
  },
  {
    name: '复旦大学',
    websiteIncludes: 'fudan.edu.cn',
    logo: 'https://www.fudan.edu.cn/_upload/site/00/02/2/logo.png',
  },
  {
    name: '同济大学',
    websiteIncludes: 'tongji.edu.cn',
    logo: 'https://www.tongji.edu.cn/images/badge.png',
  },
  {
    name: '中南大学',
    websiteIncludes: 'csu.edu.cn',
    logo: 'https://www.csu.edu.cn/__local/6/4E/C9/048A5A0DAAEEF0946772A1AA8B7_9E43D57A_5B0D2.png',
  },
  {
    name: '中国海洋大学',
    websiteIncludes: 'ouc.edu.cn',
    logo: 'https://www.ouc.edu.cn/_upload/article/2c/c2/8e73298c4ec2bda457a3f06a076a/5a1329dc-b828-4b0e-afc6-8f048a1d6df6.png',
  },
];

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFaviconUrl(website: string | null | undefined): string | null {
  const normalized = normalizeText(website);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    return `${url.origin}/favicon.ico`;
  } catch (error) {
    return null;
  }
}

function resolveUniversityLogo(name: string | null | undefined, website: string | null | undefined): string | null {
  const normalizedName = normalizeText(name);
  const normalizedWebsite = normalizeText(website).toLowerCase();
  for (const item of UNIVERSITY_LOGO_MAP) {
    if (item.name && item.name === normalizedName) return item.logo;
    if (item.websiteIncludes && normalizedWebsite.includes(item.websiteIncludes)) return item.logo;
  }
  return buildFaviconUrl(website);
}

async function main() {
  const universities = await prisma.university.findMany({
    select: {
      id: true,
      name: true,
      website: true,
      logo: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let explicitLogoMapped = 0;
  let faviconFallbackMapped = 0;

  for (const university of universities) {
    scanned += 1;
    const currentLogo = normalizeText(university.logo);
    if (currentLogo && !overwrite) {
      skipped += 1;
      continue;
    }

    const nextLogo = resolveUniversityLogo(university.name, university.website);
    if (!nextLogo) {
      skipped += 1;
      continue;
    }
    if (currentLogo === nextLogo) {
      skipped += 1;
      continue;
    }

    const normalizedWebsite = normalizeText(university.website).toLowerCase();
    const usedExplicitMap = UNIVERSITY_LOGO_MAP.some(
      (item) =>
        (item.name && item.name === normalizeText(university.name)) ||
        (item.websiteIncludes && normalizedWebsite.includes(item.websiteIncludes)),
    );
    if (usedExplicitMap) {
      explicitLogoMapped += 1;
    } else {
      faviconFallbackMapped += 1;
    }

    if (!dryRun) {
      await prisma.university.update({
        where: { id: university.id },
        data: { logo: nextLogo },
      });
    }
    updated += 1;
    console.log(`[university-logo] ${dryRun ? 'would-update' : 'updated'} id=${university.id} name=${university.name} logo=${nextLogo}`);
  }

  console.log(
    JSON.stringify(
      {
        scanned,
        updated,
        skipped,
        explicitLogoMapped,
        faviconFallbackMapped,
        dryRun,
        overwrite,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

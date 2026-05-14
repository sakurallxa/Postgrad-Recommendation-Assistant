import { PrismaClient } from '@prisma/client';
import { universities } from '../prisma/data/universities';

const prisma = new PrismaClient();
const priorityRank: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

function compareUniversityPriority(left?: string | null, right?: string | null) {
  return (priorityRank[left || 'P3'] ?? 99) - (priorityRank[right || 'P3'] ?? 99);
}

async function dedupeUniversitiesByName() {
  const universitiesInDb = await prisma.university.findMany({
    select: {
      id: true,
      name: true,
      logo: true,
      website: true,
      priority: true,
      createdAt: true,
      _count: {
        select: {
          campInfos: true,
          majors: true,
        },
      },
    },
    orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
  });

  const grouped = new Map<string, typeof universitiesInDb>();
  for (const row of universitiesInDb) {
    if (!grouped.has(row.name)) grouped.set(row.name, []);
    grouped.get(row.name)!.push(row);
  }

  let mergedGroups = 0;
  let deletedRows = 0;

  for (const rows of grouped.values()) {
    if (rows.length <= 1) continue;
    const [keeper, ...duplicates] = [...rows].sort((a, b) => {
      const campDelta = b._count.campInfos - a._count.campInfos;
      if (campDelta !== 0) return campDelta;
      const logoDelta = Number(Boolean(b.logo)) - Number(Boolean(a.logo));
      if (logoDelta !== 0) return logoDelta;
      const websiteDelta = Number(Boolean(b.website)) - Number(Boolean(a.website));
      if (websiteDelta !== 0) return websiteDelta;
      const priorityDelta = compareUniversityPriority(a.priority, b.priority);
      if (priorityDelta !== 0) return priorityDelta;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    for (const duplicate of duplicates) {
      await prisma.$transaction([
        prisma.campInfo.updateMany({
          where: { universityId: duplicate.id },
          data: { universityId: keeper.id },
        }),
        prisma.major.updateMany({
          where: { universityId: duplicate.id },
          data: { universityId: keeper.id },
        }),
        prisma.university.delete({
          where: { id: duplicate.id },
        }),
      ]);
      deletedRows += 1;
    }

    mergedGroups += 1;
  }

  return { mergedGroups, deletedRows };
}

async function main() {
  const dedupeResult = await dedupeUniversitiesByName();
  let created = 0;
  let updated = 0;
  let websiteFilled = 0;

  for (const row of universities) {
    const existing = await prisma.university.findFirst({
      where: { name: row.name },
      select: {
        id: true,
        region: true,
        level: true,
        priority: true,
        website: true,
      },
    });

    if (!existing) {
      await prisma.university.create({
        data: {
          name: row.name,
          region: row.region,
          level: row.level,
          priority: row.priority,
          website: row.website,
        },
      });
      created += 1;
      continue;
    }

    const nextWebsite = row.website || existing.website;
    if (!existing.website && row.website) {
      websiteFilled += 1;
    }

    const shouldUpdate =
      existing.region !== row.region ||
      existing.level !== row.level ||
      existing.priority !== row.priority ||
      existing.website !== nextWebsite;

    if (!shouldUpdate) {
      continue;
    }

    await prisma.university.update({
      where: { id: existing.id },
      data: {
        region: row.region,
        level: row.level,
        priority: row.priority,
        website: nextWebsite,
      },
    });
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        totalSource: universities.length,
        ...dedupeResult,
        created,
        updated,
        websiteFilled,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

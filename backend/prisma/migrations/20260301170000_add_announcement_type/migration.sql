ALTER TABLE "camp_infos" ADD COLUMN "announcementType" TEXT NOT NULL DEFAULT 'summer_camp';

UPDATE "camp_infos"
SET "announcementType" = 'pre_recommendation'
WHERE "title" LIKE '%预推免%'
   OR "title" LIKE '%推荐免试%'
   OR (
     "title" LIKE '%推免%'
     AND "title" NOT LIKE '%夏令营%'
     AND "title" NOT LIKE '%暑期%'
   )
   OR "sourceUrl" LIKE '%tuimian%';

CREATE INDEX "camp_infos_announcementType_idx" ON "camp_infos"("announcementType");

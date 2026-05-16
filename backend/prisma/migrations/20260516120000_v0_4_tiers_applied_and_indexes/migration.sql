-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_camp_infos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "announcementType" TEXT NOT NULL DEFAULT 'summer_camp',
    "subType" TEXT NOT NULL DEFAULT 'specific',
    "identityHash" TEXT,
    "identityVersion" INTEGER NOT NULL DEFAULT 1,
    "sourceUrl" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "majorId" TEXT,
    "publishDate" DATETIME,
    "deadline" DATETIME,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "location" TEXT,
    "requirements" TEXT,
    "materials" TEXT,
    "process" TEXT,
    "contact" TEXT,
    "rawContent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "confidence" REAL NOT NULL DEFAULT 1.00,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "departmentId" TEXT,
    CONSTRAINT "camp_infos_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "camp_infos_majorId_fkey" FOREIGN KEY ("majorId") REFERENCES "majors" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "camp_infos_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_camp_infos" ("announcementType", "confidence", "contact", "createdAt", "deadline", "departmentId", "endDate", "id", "identityHash", "identityVersion", "location", "majorId", "materials", "process", "publishDate", "rawContent", "requirements", "sourceUrl", "startDate", "status", "subType", "title", "universityId", "updatedAt") SELECT "announcementType", "confidence", "contact", "createdAt", "deadline", "departmentId", "endDate", "id", "identityHash", "identityVersion", "location", "majorId", "materials", "process", "publishDate", "rawContent", "requirements", "sourceUrl", "startDate", "status", "subType", "title", "universityId", "updatedAt" FROM "camp_infos";
DROP TABLE "camp_infos";
ALTER TABLE "new_camp_infos" RENAME TO "camp_infos";
CREATE INDEX "camp_infos_universityId_idx" ON "camp_infos"("universityId");
CREATE INDEX "camp_infos_majorId_idx" ON "camp_infos"("majorId");
CREATE INDEX "camp_infos_departmentId_idx" ON "camp_infos"("departmentId");
CREATE INDEX "camp_infos_deadline_idx" ON "camp_infos"("deadline");
CREATE INDEX "camp_infos_status_idx" ON "camp_infos"("status");
CREATE INDEX "camp_infos_publishDate_idx" ON "camp_infos"("publishDate");
CREATE INDEX "camp_infos_announcementType_idx" ON "camp_infos"("announcementType");
CREATE INDEX "camp_infos_identityHash_idx" ON "camp_infos"("identityHash");
CREATE INDEX "camp_infos_universityId_identityHash_idx" ON "camp_infos"("universityId", "identityHash");
CREATE TABLE "new_camp_match_results" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "isRelevant" BOOLEAN NOT NULL,
    "campType" TEXT,
    "matchesUserMajor" BOOLEAN NOT NULL DEFAULT false,
    "extractedDeadline" DATETIME,
    "extractedStartDate" DATETIME,
    "extractedEndDate" DATETIME,
    "extractedLocation" TEXT,
    "extractedSummary" TEXT,
    "keyRequirements" TEXT,
    "overallRecommendation" TEXT,
    "matchScore" INTEGER,
    "reasoning" TEXT,
    "userAction" TEXT,
    "userActionAt" DATETIME,
    "isApplied" BOOLEAN NOT NULL DEFAULT false,
    "appliedAt" DATETIME,
    "llmModel" TEXT,
    "llmTokensUsed" INTEGER,
    "llmCostUsd" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "camp_match_results_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "camp_match_results_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camp_infos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_camp_match_results" ("campId", "campType", "createdAt", "extractedDeadline", "extractedEndDate", "extractedLocation", "extractedStartDate", "extractedSummary", "id", "isRelevant", "keyRequirements", "llmCostUsd", "llmModel", "llmTokensUsed", "matchScore", "matchesUserMajor", "overallRecommendation", "reasoning", "updatedAt", "userAction", "userActionAt", "userId") SELECT "campId", "campType", "createdAt", "extractedDeadline", "extractedEndDate", "extractedLocation", "extractedStartDate", "extractedSummary", "id", "isRelevant", "keyRequirements", "llmCostUsd", "llmModel", "llmTokensUsed", "matchScore", "matchesUserMajor", "overallRecommendation", "reasoning", "updatedAt", "userAction", "userActionAt", "userId" FROM "camp_match_results";
DROP TABLE "camp_match_results";
ALTER TABLE "new_camp_match_results" RENAME TO "camp_match_results";
CREATE INDEX "camp_match_results_userId_userAction_idx" ON "camp_match_results"("userId", "userAction");
CREATE INDEX "camp_match_results_userId_createdAt_idx" ON "camp_match_results"("userId", "createdAt");
CREATE INDEX "camp_match_results_userId_overallRecommendation_idx" ON "camp_match_results"("userId", "overallRecommendation");
CREATE UNIQUE INDEX "camp_match_results_userId_campId_key" ON "camp_match_results"("userId", "campId");
CREATE TABLE "new_universities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "logo" TEXT,
    "region" TEXT,
    "level" TEXT,
    "website" TEXT,
    "gradWebsite" TEXT,
    "is985" BOOLEAN NOT NULL DEFAULT false,
    "is211" BOOLEAN NOT NULL DEFAULT false,
    "isDoubleFirstClass" BOOLEAN NOT NULL DEFAULT false,
    "priority" TEXT NOT NULL DEFAULT 'P3',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_universities" ("createdAt", "id", "level", "logo", "name", "priority", "region", "updatedAt", "website") SELECT "createdAt", "id", "level", "logo", "name", "priority", "region", "updatedAt", "website" FROM "universities";
DROP TABLE "universities";
ALTER TABLE "new_universities" RENAME TO "universities";
CREATE INDEX "universities_name_idx" ON "universities"("name");
CREATE INDEX "universities_region_idx" ON "universities"("region");
CREATE INDEX "universities_level_idx" ON "universities"("level");
CREATE INDEX "universities_priority_idx" ON "universities"("priority");
CREATE TABLE "new_user_department_subscriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_department_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_department_subscriptions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_user_department_subscriptions" ("active", "createdAt", "departmentId", "id", "updatedAt", "userId") SELECT "active", "createdAt", "departmentId", "id", "updatedAt", "userId" FROM "user_department_subscriptions";
DROP TABLE "user_department_subscriptions";
ALTER TABLE "new_user_department_subscriptions" RENAME TO "user_department_subscriptions";
CREATE INDEX "user_department_subscriptions_userId_idx" ON "user_department_subscriptions"("userId");
CREATE INDEX "user_department_subscriptions_departmentId_idx" ON "user_department_subscriptions"("departmentId");
CREATE UNIQUE INDEX "user_department_subscriptions_userId_departmentId_key" ON "user_department_subscriptions"("userId", "departmentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "reminders_userId_createdAt_idx" ON "reminders"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "reminders_userId_status_idx" ON "reminders"("userId", "status");


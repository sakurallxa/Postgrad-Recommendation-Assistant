-- v0.2 重构：AI 助理 + 院系订阅 + 匹配结果

-- 1. 扩展 user_profiles
ALTER TABLE "user_profiles" ADD COLUMN "targetMajors" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "englishStandardized" TEXT;

-- 2. 扩展 camp_infos：关联到 department
ALTER TABLE "camp_infos" ADD COLUMN "departmentId" TEXT;
CREATE INDEX "camp_infos_departmentId_idx" ON "camp_infos"("departmentId");

-- 3. 新增 departments 表
CREATE TABLE "departments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolSlug" TEXT NOT NULL,
    "universityId" TEXT,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "homepage" TEXT,
    "noticeUrl" TEXT,
    "majors" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "departments_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "departments_schoolSlug_idx" ON "departments"("schoolSlug");
CREATE INDEX "departments_universityId_idx" ON "departments"("universityId");

-- 4. 新增 user_department_subscriptions 表
CREATE TABLE "user_department_subscriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_department_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_department_subscriptions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "user_department_subscriptions_userId_departmentId_key" ON "user_department_subscriptions"("userId", "departmentId");
CREATE INDEX "user_department_subscriptions_userId_idx" ON "user_department_subscriptions"("userId");
CREATE INDEX "user_department_subscriptions_departmentId_idx" ON "user_department_subscriptions"("departmentId");

-- 5. 新增 camp_match_results 表
CREATE TABLE "camp_match_results" (
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
    "llmModel" TEXT,
    "llmTokensUsed" INTEGER,
    "llmCostUsd" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "camp_match_results_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "camp_match_results_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camp_infos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "camp_match_results_userId_campId_key" ON "camp_match_results"("userId", "campId");
CREATE INDEX "camp_match_results_userId_userAction_idx" ON "camp_match_results"("userId", "userAction");
CREATE INDEX "camp_match_results_userId_createdAt_idx" ON "camp_match_results"("userId", "createdAt");
CREATE INDEX "camp_match_results_userId_overallRecommendation_idx" ON "camp_match_results"("userId", "overallRecommendation");

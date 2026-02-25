-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "openid" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "universities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "logo" TEXT,
    "region" TEXT,
    "level" TEXT,
    "website" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'P3',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "majors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "universityId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "majors_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "camp_infos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "majorId" TEXT,
    "publishDate" DATETIME,
    "deadline" DATETIME,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "requirements" TEXT,
    "materials" TEXT,
    "process" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "confidence" REAL NOT NULL DEFAULT 1.00,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "camp_infos_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "camp_infos_majorId_fkey" FOREIGN KEY ("majorId") REFERENCES "majors" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_selections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "universityIds" TEXT,
    "majorIds" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_selections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "remindTime" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "templateId" TEXT,
    "sentAt" DATETIME,
    "errorMsg" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "reminders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "reminders_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camp_infos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "crawler_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "universityId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "errorMsg" TEXT,
    "itemsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "api_call_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apiType" TEXT NOT NULL,
    "callCount" INTEGER NOT NULL DEFAULT 1,
    "cost" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "errorMsg" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "users_openid_key" ON "users"("openid");

-- CreateIndex
CREATE INDEX "users_openid_idx" ON "users"("openid");

-- CreateIndex
CREATE INDEX "universities_name_idx" ON "universities"("name");

-- CreateIndex
CREATE INDEX "universities_region_idx" ON "universities"("region");

-- CreateIndex
CREATE INDEX "universities_level_idx" ON "universities"("level");

-- CreateIndex
CREATE INDEX "universities_priority_idx" ON "universities"("priority");

-- CreateIndex
CREATE INDEX "majors_name_idx" ON "majors"("name");

-- CreateIndex
CREATE INDEX "majors_category_idx" ON "majors"("category");

-- CreateIndex
CREATE INDEX "majors_universityId_idx" ON "majors"("universityId");

-- CreateIndex
CREATE INDEX "camp_infos_universityId_idx" ON "camp_infos"("universityId");

-- CreateIndex
CREATE INDEX "camp_infos_majorId_idx" ON "camp_infos"("majorId");

-- CreateIndex
CREATE INDEX "camp_infos_deadline_idx" ON "camp_infos"("deadline");

-- CreateIndex
CREATE INDEX "camp_infos_status_idx" ON "camp_infos"("status");

-- CreateIndex
CREATE INDEX "camp_infos_publishDate_idx" ON "camp_infos"("publishDate");

-- CreateIndex
CREATE UNIQUE INDEX "user_selections_userId_key" ON "user_selections"("userId");

-- CreateIndex
CREATE INDEX "user_selections_userId_idx" ON "user_selections"("userId");

-- CreateIndex
CREATE INDEX "reminders_userId_idx" ON "reminders"("userId");

-- CreateIndex
CREATE INDEX "reminders_campId_idx" ON "reminders"("campId");

-- CreateIndex
CREATE INDEX "reminders_status_idx" ON "reminders"("status");

-- CreateIndex
CREATE INDEX "reminders_remindTime_idx" ON "reminders"("remindTime");

-- CreateIndex
CREATE INDEX "crawler_logs_universityId_idx" ON "crawler_logs"("universityId");

-- CreateIndex
CREATE INDEX "crawler_logs_status_idx" ON "crawler_logs"("status");

-- CreateIndex
CREATE INDEX "crawler_logs_createdAt_idx" ON "crawler_logs"("createdAt");

-- CreateIndex
CREATE INDEX "api_call_logs_apiType_idx" ON "api_call_logs"("apiType");

-- CreateIndex
CREATE INDEX "api_call_logs_createdAt_idx" ON "api_call_logs"("createdAt");

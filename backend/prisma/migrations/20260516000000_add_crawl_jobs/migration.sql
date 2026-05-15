-- v0.3 按需点对点抓取作业 + 学院级缓存

-- CreateTable: 抓取作业
CREATE TABLE "crawl_jobs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "triggerType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "scopeJson" TEXT NOT NULL,
  "totalTargets" INTEGER NOT NULL,
  "completedTargets" INTEGER NOT NULL DEFAULT 0,
  "campsFound" INTEGER NOT NULL DEFAULT 0,
  "emptyTargetsJson" TEXT,
  "startedAt" DATETIME,
  "finishedAt" DATETIME,
  "errorMsg" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "crawl_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "crawl_jobs_userId_createdAt_idx" ON "crawl_jobs"("userId", "createdAt");
CREATE INDEX "crawl_jobs_status_idx" ON "crawl_jobs"("status");

-- CreateTable: 学院级抓取缓存（24h TTL）
CREATE TABLE "department_crawl_caches" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "departmentId" TEXT NOT NULL,
  "lastCrawledAt" DATETIME NOT NULL,
  "campsFoundLast" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL,
  "ttlExpiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "department_crawl_caches_departmentId_key" ON "department_crawl_caches"("departmentId");
CREATE INDEX "department_crawl_caches_ttlExpiresAt_idx" ON "department_crawl_caches"("ttlExpiresAt");

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

ALTER TABLE "camp_infos" ADD COLUMN "identityHash" TEXT;
ALTER TABLE "camp_infos" ADD COLUMN "identityVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "camp_source_aliases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceUrlHash" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "camp_source_aliases_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camp_infos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "camp_watch_subscriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "deadlineChanged" BOOLEAN NOT NULL DEFAULT true,
    "materialsChanged" BOOLEAN NOT NULL DEFAULT true,
    "admissionResultChanged" BOOLEAN NOT NULL DEFAULT true,
    "outstandingResultChanged" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "wechatEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "camp_watch_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "camp_watch_subscriptions_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camp_infos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "progress_change_events" ADD COLUMN "idempotencyKey" TEXT;

ALTER TABLE "progress_alerts" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'in_app';
ALTER TABLE "progress_alerts" ADD COLUMN "sendStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "progress_alerts" ADD COLUMN "sendAttempt" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "progress_alerts" ADD COLUMN "lastError" TEXT;
ALTER TABLE "progress_alerts" ADD COLUMN "sentAt" DATETIME;
ALTER TABLE "progress_alerts" ADD COLUMN "idempotencyKey" TEXT;

CREATE INDEX "camp_infos_identityHash_idx" ON "camp_infos"("identityHash");
CREATE INDEX "camp_infos_universityId_identityHash_idx" ON "camp_infos"("universityId", "identityHash");

CREATE UNIQUE INDEX "camp_source_aliases_universityId_sourceUrlHash_key" ON "camp_source_aliases"("universityId", "sourceUrlHash");
CREATE INDEX "camp_source_aliases_campId_lastSeenAt_idx" ON "camp_source_aliases"("campId", "lastSeenAt");

CREATE UNIQUE INDEX "camp_watch_subscriptions_userId_campId_key" ON "camp_watch_subscriptions"("userId", "campId");
CREATE INDEX "camp_watch_subscriptions_campId_enabled_idx" ON "camp_watch_subscriptions"("campId", "enabled");
CREATE INDEX "camp_watch_subscriptions_userId_enabled_idx" ON "camp_watch_subscriptions"("userId", "enabled");

CREATE UNIQUE INDEX "progress_change_events_idempotencyKey_key" ON "progress_change_events"("idempotencyKey");
CREATE UNIQUE INDEX "progress_alerts_idempotencyKey_key" ON "progress_alerts"("idempotencyKey");
CREATE INDEX "progress_alerts_channel_sendStatus_scheduledAt_idx" ON "progress_alerts"("channel", "sendStatus", "scheduledAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

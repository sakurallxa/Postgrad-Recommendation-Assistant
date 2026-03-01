PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "application_progresses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'followed',
    "nextAction" TEXT,
    "statusNote" TEXT,
    "lastStatusAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    "admissionPublishedAt" DATETIME,
    "admittedAt" DATETIME,
    "outstandingPublishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "application_progresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "application_progresses_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camp_infos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "progress_status_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "progressId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "progress_status_logs_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "application_progresses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "progress_subscriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "progressId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deadlineChanged" BOOLEAN NOT NULL DEFAULT true,
    "materialsChanged" BOOLEAN NOT NULL DEFAULT true,
    "admissionResultChanged" BOOLEAN NOT NULL DEFAULT true,
    "outstandingResultChanged" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "progress_subscriptions_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "application_progresses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "progress_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "progress_change_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fieldName" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'crawler',
    "sourceUrl" TEXT,
    "sourceUpdatedAt" DATETIME,
    "confidenceLabel" TEXT NOT NULL DEFAULT 'medium',
    "confidenceScore" REAL NOT NULL DEFAULT 0.6,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "progress_change_events_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camp_infos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "progress_alerts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "progressId" TEXT,
    "campId" TEXT,
    "eventId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "confidenceLabel" TEXT,
    "scheduledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snoozeUntil" DATETIME,
    "handledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "progress_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "progress_alerts_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "application_progresses" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "progress_alerts_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camp_infos" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "progress_alerts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "progress_change_events" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "application_progresses_userId_campId_key" ON "application_progresses"("userId", "campId");
CREATE INDEX "application_progresses_userId_status_idx" ON "application_progresses"("userId", "status");
CREATE INDEX "application_progresses_campId_idx" ON "application_progresses"("campId");
CREATE INDEX "application_progresses_updatedAt_idx" ON "application_progresses"("updatedAt");

CREATE INDEX "progress_status_logs_progressId_changedAt_idx" ON "progress_status_logs"("progressId", "changedAt");

CREATE UNIQUE INDEX "progress_subscriptions_progressId_key" ON "progress_subscriptions"("progressId");
CREATE INDEX "progress_subscriptions_userId_enabled_idx" ON "progress_subscriptions"("userId", "enabled");

CREATE INDEX "progress_change_events_campId_createdAt_idx" ON "progress_change_events"("campId", "createdAt");
CREATE INDEX "progress_change_events_eventType_createdAt_idx" ON "progress_change_events"("eventType", "createdAt");
CREATE INDEX "progress_change_events_confidenceLabel_idx" ON "progress_change_events"("confidenceLabel");

CREATE INDEX "progress_alerts_userId_status_scheduledAt_idx" ON "progress_alerts"("userId", "status", "scheduledAt");
CREATE INDEX "progress_alerts_progressId_idx" ON "progress_alerts"("progressId");
CREATE INDEX "progress_alerts_campId_idx" ON "progress_alerts"("campId");
CREATE INDEX "progress_alerts_eventId_idx" ON "progress_alerts"("eventId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

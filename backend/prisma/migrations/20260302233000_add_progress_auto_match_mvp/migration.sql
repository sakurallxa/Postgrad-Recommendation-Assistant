PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

ALTER TABLE "progress_status_logs" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "progress_status_logs" ADD COLUMN "sourceEventId" TEXT;
ALTER TABLE "progress_status_logs" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "progress_status_logs" ADD COLUMN "evidenceJson" TEXT;
ALTER TABLE "progress_status_logs" ADD COLUMN "rollbackOfLogId" TEXT;
ALTER TABLE "progress_status_logs" ADD COLUMN "rolledBackAt" DATETIME;

ALTER TABLE "progress_alerts" ADD COLUMN "actionType" TEXT;
ALTER TABLE "progress_alerts" ADD COLUMN "actionToken" TEXT;
ALTER TABLE "progress_alerts" ADD COLUMN "actionPayloadJson" TEXT;
ALTER TABLE "progress_alerts" ADD COLUMN "actionExpireAt" DATETIME;

CREATE TABLE "progress_match_candidates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "progressId" TEXT NOT NULL,
    "matchConfidenceScore" REAL NOT NULL DEFAULT 0,
    "matchConfidenceLabel" TEXT NOT NULL DEFAULT 'low',
    "featuresJson" TEXT,
    "decision" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "progress_match_candidates_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "progress_change_events" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "progress_match_candidates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "progress_match_candidates_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "application_progresses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "camp_result_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "nameRaw" TEXT NOT NULL,
    "nameHash" TEXT NOT NULL,
    "schoolRaw" TEXT,
    "majorRaw" TEXT,
    "auxJson" TEXT,
    "sourceSnippet" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "camp_result_entries_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camp_infos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "camp_result_entries_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "progress_change_events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "progress_status_logs_idempotencyKey_key" ON "progress_status_logs"("idempotencyKey");
CREATE INDEX "progress_status_logs_sourceEventId_idx" ON "progress_status_logs"("sourceEventId");

CREATE UNIQUE INDEX "progress_alerts_actionToken_key" ON "progress_alerts"("actionToken");
CREATE INDEX "progress_alerts_actionExpireAt_idx" ON "progress_alerts"("actionExpireAt");

CREATE UNIQUE INDEX "progress_match_candidates_eventId_userId_key" ON "progress_match_candidates"("eventId", "userId");
CREATE INDEX "progress_match_candidates_progressId_createdAt_idx" ON "progress_match_candidates"("progressId", "createdAt");
CREATE INDEX "progress_match_candidates_eventId_matchConfidenceLabel_idx" ON "progress_match_candidates"("eventId", "matchConfidenceLabel");

CREATE INDEX "camp_result_entries_campId_eventId_entryType_idx" ON "camp_result_entries"("campId", "eventId", "entryType");
CREATE INDEX "camp_result_entries_nameHash_entryType_idx" ON "camp_result_entries"("nameHash", "entryType");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

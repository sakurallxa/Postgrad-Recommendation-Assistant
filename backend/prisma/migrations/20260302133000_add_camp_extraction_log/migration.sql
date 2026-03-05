PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "camp_extraction_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campId" TEXT,
    "universityId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "triggerReasons" TEXT,
    "sourceSnippet" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'deepseek',
    "model" TEXT,
    "extractionVersion" TEXT NOT NULL,
    "confidenceScore" REAL,
    "requestPayload" TEXT,
    "responsePayload" TEXT,
    "parsedResult" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "camp_extraction_logs_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camp_infos" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "camp_extraction_logs_campId_createdAt_idx" ON "camp_extraction_logs"("campId", "createdAt");
CREATE INDEX "camp_extraction_logs_universityId_createdAt_idx" ON "camp_extraction_logs"("universityId", "createdAt");
CREATE INDEX "camp_extraction_logs_sourceUrl_idx" ON "camp_extraction_logs"("sourceUrl");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

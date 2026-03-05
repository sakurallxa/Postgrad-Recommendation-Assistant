CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "schoolName" TEXT,
    "schoolLevel" TEXT,
    "education" TEXT,
    "major" TEXT,
    "gradeRankPercent" REAL,
    "gradeRankText" TEXT,
    "gpa" TEXT,
    "englishType" TEXT,
    "englishScore" REAL,
    "researchExperience" TEXT,
    "competitionAwards" TEXT,
    "preferredDirection" TEXT,
    "targetNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "user_profiles_userId_key" ON "user_profiles"("userId");
CREATE INDEX "user_profiles_userId_idx" ON "user_profiles"("userId");

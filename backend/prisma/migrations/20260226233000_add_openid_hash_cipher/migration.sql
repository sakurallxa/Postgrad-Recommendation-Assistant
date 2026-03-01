PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "openid" TEXT,
    "openidHash" TEXT,
    "openidCipher" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_users" ("id", "openid", "createdAt", "updatedAt")
SELECT "id", "openid", "createdAt", "updatedAt" FROM "users";

DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";

CREATE UNIQUE INDEX "users_openid_key" ON "users"("openid");
CREATE UNIQUE INDEX "users_openidHash_key" ON "users"("openidHash");
CREATE INDEX "users_openidHash_idx" ON "users"("openidHash");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


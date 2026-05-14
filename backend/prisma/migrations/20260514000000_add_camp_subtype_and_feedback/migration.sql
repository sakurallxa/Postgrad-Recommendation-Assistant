-- MVP β场景：公告子类型 + 用户反馈表

-- 1. 公告子类型字段（specific=有具体报名时间 / framework=章程/工作办法/无统一截止日）
ALTER TABLE "camp_infos" ADD COLUMN "subType" TEXT NOT NULL DEFAULT 'specific';

-- 2. 用户对公告字段错误的反馈表
CREATE TABLE "camp_feedbacks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campId" TEXT NOT NULL,
    "userId" TEXT,
    "issueType" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "reviewerNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "camp_feedbacks_campId_createdAt_idx" ON "camp_feedbacks"("campId", "createdAt");
CREATE INDEX "camp_feedbacks_status_idx" ON "camp_feedbacks"("status");
CREATE INDEX "camp_feedbacks_userId_idx" ON "camp_feedbacks"("userId");

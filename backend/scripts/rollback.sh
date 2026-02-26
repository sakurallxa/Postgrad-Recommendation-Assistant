#!/bin/bash
# 回滚脚本 - 用于紧急情况下回滚到之前版本
# 执行时间: $(date '+%Y-%m-%d %H:%M:%S')

set -e  # 遇到错误立即退出

echo "=========================================="
echo "     保研信息助手 - 紧急回滚脚本"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo -e "${RED}错误: 请在backend目录下执行此脚本${NC}"
    exit 1
fi

echo -e "${YELLOW}警告: 此操作将回滚数据库和代码更改${NC}"
echo ""
read -p "确定要执行回滚吗? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "回滚操作已取消"
    exit 0
fi

echo ""
echo "=========================================="
echo "步骤1: 备份当前状态"
echo "=========================================="

# 备份当前数据库
backup_file="prisma/dev.db.backup.rollback.$(date +%Y%m%d_%H%M%S)"
cp prisma/dev.db "$backup_file"
echo -e "${GREEN}✓ 数据库已备份到: $backup_file${NC}"

# 备份当前代码
git stash push -m "rollback-backup-$(date +%Y%m%d_%H%M%S)" || true
echo -e "${GREEN}✓ 代码更改已暂存${NC}"

echo ""
echo "=========================================="
echo "步骤2: 数据库回滚"
echo "=========================================="

# 删除新增的索引
echo "删除新增的索引..."
sqlite3 prisma/dev.db "DROP INDEX IF EXISTS reminders_userId_createdAt_idx;" && echo -e "${GREEN}✓ 删除索引 reminders_userId_createdAt_idx${NC}"
sqlite3 prisma/dev.db "DROP INDEX IF EXISTS reminders_userId_status_idx;" && echo -e "${GREEN}✓ 删除索引 reminders_userId_status_idx${NC}"

# 验证索引已删除
echo ""
echo "当前索引列表:"
sqlite3 prisma/dev.db ".indexes reminders"

echo ""
echo "=========================================="
echo "步骤3: 代码回滚"
echo "=========================================="

# 回滚Git提交
echo "回滚最近的P0修复提交..."
git revert 715acb0 --no-edit || echo -e "${YELLOW}⚠ 提交 715acb0 回滚失败或已回滚${NC}"
git revert 51a9f01 --no-edit || echo -e "${YELLOW}⚠ 提交 51a9f01 回滚失败或已回滚${NC}"

# 推送回滚到远程
echo "推送回滚到远程仓库..."
git push origin main || echo -e "${YELLOW}⚠ 推送到远程失败，请手动处理${NC}"

echo ""
echo "=========================================="
echo "步骤4: 清理前端更改"
echo "=========================================="

# 检查前端服务文件
if [ -f "../miniprogram/services/reminder.js" ]; then
    echo "前端提醒服务文件存在，如需回滚请手动删除或修改:"
    echo "  - ../miniprogram/services/reminder.js"
    echo "  - ../miniprogram/services/camp.js"
    echo "  - ../miniprogram/packageReminder/pages/my-reminders/index.js"
    echo "  - ../miniprogram/packageReminder/pages/reminder-create/index.js"
fi

echo ""
echo "=========================================="
echo "回滚完成"
echo "=========================================="
echo ""
echo -e "${GREEN}✓ 数据库已回滚${NC}"
echo -e "${GREEN}✓ 代码已回滚${NC}"
echo ""
echo "备份文件: $backup_file"
echo ""
echo -e "${YELLOW}注意: 请验证回滚后的系统状态${NC}"
echo "建议执行以下检查:"
echo "  1. 检查数据库索引: sqlite3 prisma/dev.db '.indexes reminders'"
echo "  2. 检查代码状态: git log --oneline -5"
echo "  3. 测试关键功能是否正常"
echo ""

#!/bin/bash
# 健康检查脚本 - 用于监控系统状态
# 建议通过cron定时执行: */5 * * * * /path/to/health-check.sh

set -e

# 配置
LOG_FILE="logs/health-check.log"
ALERT_EMAIL="admin@example.com"
DB_PATH="prisma/dev.db"
BACKEND_URL="http://localhost:3000"

# 创建日志目录
mkdir -p logs

# 记录日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 检查数据库健康
check_database() {
    log "检查数据库健康..."
    
    # 检查数据库文件是否存在
    if [ ! -f "$DB_PATH" ]; then
        log "❌ 错误: 数据库文件不存在"
        return 1
    fi
    
    # 检查数据库是否可以访问
    if ! sqlite3 "$DB_PATH" "SELECT 1;" > /dev/null 2>&1; then
        log "❌ 错误: 数据库无法访问"
        return 1
    fi
    
    # 检查关键表
    local tables=("users" "camp_infos" "reminders" "universities" "majors")
    for table in "${tables[@]}"; do
        local count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM $table;" 2>/dev/null || echo "0")
        log "  ✓ 表 $table: $count 条记录"
    done
    
    # 检查索引
    local index_count=$(sqlite3 "$DB_PATH" ".indexes reminders" | wc -l)
    log "  ✓ reminders表索引数: $index_count"
    
    log "✅ 数据库健康检查通过"
    return 0
}

# 检查API健康
check_api() {
    log "检查API健康..."
    
    # 检查后端服务是否可访问
    local http_code=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/health" 2>/dev/null || echo "000")
    
    if [ "$http_code" = "200" ]; then
        log "✅ API健康检查通过 (HTTP $http_code)"
        return 0
    else
        log "❌ 错误: API返回 HTTP $http_code"
        return 1
    fi
}

# 检查性能指标
check_performance() {
    log "检查性能指标..."
    
    # 检查数据库查询性能（使用简单计时）
    local start_time=$(date +%s)
    sqlite3 "$DB_PATH" "SELECT * FROM reminders WHERE userId = 'test-user-001' LIMIT 20;" > /dev/null 2>&1
    local end_time=$(date +%s)
    local duration=$(( (end_time - start_time) * 1000 ))  # 转换为毫秒
    
    log "  查询响应时间: ${duration}ms"
    
    if [ "$duration" -gt 500 ]; then
        log "⚠️ 警告: 查询响应时间超过500ms"
        return 1
    fi
    
    log "✅ 性能检查通过"
    return 0
}

# 检查磁盘空间
check_disk_space() {
    log "检查磁盘空间..."
    
    local usage=$(df -h . | awk 'NR==2 {print $5}' | sed 's/%//')
    log "  磁盘使用率: ${usage}%"
    
    if [ "$usage" -gt 80 ]; then
        log "⚠️ 警告: 磁盘使用率超过80%"
        return 1
    fi
    
    log "✅ 磁盘空间检查通过"
    return 0
}

# 检查日志文件大小
check_log_size() {
    log "检查日志文件..."
    
    if [ -f "$LOG_FILE" ]; then
        local size=$(du -m "$LOG_FILE" | cut -f1)
        log "  日志文件大小: ${size}MB"
        
        if [ "$size" -gt 100 ]; then
            log "⚠️ 警告: 日志文件超过100MB，建议清理"
            # 自动轮转日志
            mv "$LOG_FILE" "${LOG_FILE}.$(date +%Y%m%d)"
            touch "$LOG_FILE"
            log "  日志已轮转"
        fi
    fi
    
    log "✅ 日志检查通过"
    return 0
}

# 发送告警
send_alert() {
    local message="$1"
    log "🚨 发送告警: $message"
    
    # 这里可以集成邮件、短信、钉钉等告警方式
    # echo "$message" | mail -s "保研信息助手告警" "$ALERT_EMAIL"
    
    # 记录到告警日志
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $message" >> logs/alerts.log
}

# 主函数
main() {
    log "=========================================="
    log "开始健康检查"
    log "=========================================="
    
    local has_error=0
    
    # 执行各项检查
    check_database || has_error=1
    check_api || has_error=1
    check_performance || has_error=1
    check_disk_space || has_error=1
    check_log_size || has_error=1
    
    log "=========================================="
    if [ $has_error -eq 0 ]; then
        log "✅ 所有检查通过，系统健康"
    else
        log "❌ 发现异常，请查看详细日志"
        send_alert "健康检查发现异常，请检查日志: $LOG_FILE"
    fi
    log "=========================================="
    
    return $has_error
}

# 执行主函数
main "$@"

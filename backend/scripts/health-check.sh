#!/bin/bash
# 健康检查脚本 - 用于监控系统状态
# 建议通过cron定时执行: */5 * * * * /path/to/health-check.sh

set -e

# 配置
LOG_FILE="logs/health-check.log"
ALERT_EMAIL="admin@example.com"
DB_PATH="prisma/dev.db"
BACKEND_URL="http://localhost:3000"
DISK_WARN_THRESHOLD="${DISK_WARN_THRESHOLD:-85}"
DISK_CRITICAL_THRESHOLD="${DISK_CRITICAL_THRESHOLD:-95}"
PERF_WARN_MS="${PERF_WARN_MS:-500}"
PERF_CRITICAL_MS="${PERF_CRITICAL_MS:-1500}"

warning_count=0
critical_count=0

# 创建日志目录
mkdir -p logs

# 记录日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

record_warning() {
    warning_count=$((warning_count + 1))
    log "⚠️ 警告: $1"
}

record_critical() {
    critical_count=$((critical_count + 1))
    log "❌ 错误: $1"
}

get_env_value() {
    local key="$1"
    local default_value="$2"
    local value="${!key}"

    if [ -n "$value" ]; then
        echo "$value"
        return
    fi

    if [ -f ".env" ]; then
        value=$(grep -E "^${key}=" .env 2>/dev/null | tail -n 1 | cut -d '=' -f 2- || true)
        value="${value%\"}"
        value="${value#\"}"
    fi

    if [ -n "$value" ]; then
        echo "$value"
    else
        echo "$default_value"
    fi
}

# 检查数据库健康
check_database() {
    log "检查数据库健康..."
    
    # 检查数据库文件是否存在
    if [ ! -f "$DB_PATH" ]; then
        record_critical "数据库文件不存在"
        return 1
    fi
    
    # 检查数据库是否可以访问
    if ! sqlite3 "$DB_PATH" "SELECT 1;" > /dev/null 2>&1; then
        record_critical "数据库无法访问"
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
    
    local health_urls=("$BACKEND_URL/health" "$BACKEND_URL/api/v1/health")
    local url=""
    local http_code=""

    for url in "${health_urls[@]}"; do
        http_code=$(curl -sS -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 8 "$url" 2>/dev/null || true)
        if [[ "$http_code" =~ ^[0-9]{3}$ ]] && [ "$http_code" = "200" ]; then
            log "✅ API健康检查通过: $url (HTTP $http_code)"
            return 0
        fi
    done

    if [[ ! "$http_code" =~ ^[0-9]{3}$ ]]; then
        http_code="000"
    fi
    record_critical "API健康检查失败，最后一次返回 HTTP $http_code"
    return 1
}

# 检查Redis健康
check_redis() {
    log "检查Redis健康..."

    local redis_enabled
    redis_enabled=$(get_env_value "REDIS_ENABLED" "true")
    if [ "$redis_enabled" = "false" ]; then
        log "ℹ️ Redis已禁用，跳过检查"
        return 0
    fi

    if ! command -v redis-cli >/dev/null 2>&1; then
        record_critical "redis-cli 不可用，无法执行Redis就绪检查"
        return 1
    fi

    local redis_host redis_port redis_password redis_db ping_result
    redis_host=$(get_env_value "REDIS_HOST" "127.0.0.1")
    redis_port=$(get_env_value "REDIS_PORT" "6379")
    redis_password=$(get_env_value "REDIS_PASSWORD" "")
    redis_db=$(get_env_value "REDIS_DB" "0")

    if [ -n "$redis_password" ]; then
        ping_result=$(redis-cli -h "$redis_host" -p "$redis_port" -n "$redis_db" -a "$redis_password" --no-auth-warning ping 2>/dev/null || true)
    else
        ping_result=$(redis-cli -h "$redis_host" -p "$redis_port" -n "$redis_db" ping 2>/dev/null || true)
    fi

    if [ "$ping_result" = "PONG" ]; then
        log "✅ Redis健康检查通过 ($redis_host:$redis_port/$redis_db)"
        return 0
    fi

    record_critical "Redis不可用 ($redis_host:$redis_port/$redis_db)"
    return 1
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
    
    if [ "$duration" -gt "$PERF_CRITICAL_MS" ]; then
        record_critical "查询响应时间超过${PERF_CRITICAL_MS}ms"
        return 1
    fi

    if [ "$duration" -gt "$PERF_WARN_MS" ]; then
        record_warning "查询响应时间超过${PERF_WARN_MS}ms"
        return 0
    fi
    
    log "✅ 性能检查通过"
    return 0
}

# 检查磁盘空间
check_disk_space() {
    log "检查磁盘空间..."
    
    local usage=$(df -h . | awk 'NR==2 {print $5}' | sed 's/%//')
    log "  磁盘使用率: ${usage}%"
    
    if [ "$usage" -gt "$DISK_CRITICAL_THRESHOLD" ]; then
        record_critical "磁盘使用率超过${DISK_CRITICAL_THRESHOLD}%"
        return 1
    fi

    if [ "$usage" -gt "$DISK_WARN_THRESHOLD" ]; then
        record_warning "磁盘使用率超过${DISK_WARN_THRESHOLD}%"
        return 0
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
            record_warning "日志文件超过100MB，建议清理"
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
    local level="$1"
    local message="${2:-}"
    log "🚨 发送告警[$level]: $message"
    
    # 这里可以集成邮件、短信、钉钉等告警方式
    # echo "$message" | mail -s "保研信息助手告警" "$ALERT_EMAIL"
    
    # 记录到告警日志
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message" >> logs/alerts.log
}

# 主函数
main() {
    log "=========================================="
    log "开始健康检查"
    log "=========================================="
    
    # 执行各项检查
    check_database || true
    check_api || true
    check_redis || true
    check_performance || true
    check_disk_space || true
    check_log_size || true
    
    log "=========================================="
    if [ $critical_count -gt 0 ]; then
        log "❌ 健康检查失败: critical=${critical_count}, warning=${warning_count}"
        send_alert "CRITICAL" "健康检查失败，critical=${critical_count}, warning=${warning_count}"
        log "=========================================="
        return 1
    fi

    if [ $warning_count -gt 0 ]; then
        log "⚠️ 健康检查通过（有告警）: critical=0, warning=${warning_count}"
        send_alert "WARNING" "健康检查通过但存在告警，warning=${warning_count}"
        log "=========================================="
        return 0
    fi

    log "✅ 所有检查通过，系统健康"
    log "=========================================="
    return 0
}

# 执行主函数
main "$@"

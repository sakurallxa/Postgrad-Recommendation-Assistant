# 保研信息助手爬虫服务 - Scrapy配置
# 366所院校全量覆盖配置

import os
from dotenv import load_dotenv

load_dotenv()

# ==========================================
# 基础配置
# ==========================================
BOT_NAME = 'baoyan_crawler'

SPIDER_MODULES = ['baoyan_crawler.spiders']
NEWSPIDER_MODULE = 'baoyan_crawler.spiders'

# 遵守robots.txt规则
ROBOTSTXT_OBEY = True

# ==========================================
# 并发配置（366所院校优化）
# ==========================================
# 并发请求数
CONCURRENT_REQUESTS = 16

# 同一域名并发请求数
CONCURRENT_REQUESTS_PER_DOMAIN = 2

# 下载延迟（秒）- 限速保护
DOWNLOAD_DELAY = 30  # 每30秒一个请求，避免对院校服务器造成压力

# 随机延迟范围
RANDOMIZE_DOWNLOAD_DELAY = True

# ==========================================
# 管道配置
# ==========================================
ITEM_PIPELINES = {
    'baoyan_crawler.pipelines.ValidationPipeline': 100,
    'baoyan_crawler.pipelines.DatabasePipeline': 200,
    'baoyan_crawler.pipelines.AIExtractionPipeline': 300,
}

# ==========================================
# 中间件配置
# ==========================================
DOWNLOADER_MIDDLEWARES = {
    'baoyan_crawler.middlewares.retry.RetryMiddleware': 90,
    'scrapy.downloadermiddlewares.retry.RetryMiddleware': None,
    'baoyan_crawler.middlewares.proxy.ProxyMiddleware': 100,
    'baoyan_crawler.middlewares.useragent.UserAgentMiddleware': 110,
}

SPIDER_MIDDLEWARES = {
    'baoyan_crawler.middlewares.error.ErrorMiddleware': 50,
}

# ==========================================
# 扩展配置
# ==========================================
EXTENSIONS = {
    'scrapy.extensions.telnet.TelnetConsole': None,
    'baoyan_crawler.extensions.monitor.MonitorExtension': 100,
}

# ==========================================
# 日志配置
# ==========================================
LOG_LEVEL = 'INFO'
LOG_FILE = 'logs/crawler.log'

# ==========================================
# 重试配置
# ==========================================
RETRY_ENABLED = True
RETRY_TIMES = 3
RETRY_HTTP_CODES = [500, 502, 503, 504, 408, 429]

# ==========================================
# 超时配置
# ==========================================
DOWNLOAD_TIMEOUT = 30

# ==========================================
# 数据库配置
# ==========================================
DATABASE_URL = os.getenv('DATABASE_URL', 'mysql://root:password@localhost:3306/baoyan')

# ==========================================
# Redis配置
# ==========================================
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', '')
REDIS_DB = int(os.getenv('REDIS_DB', 0))

# ==========================================
# DeepSeek API配置（基于366所院校）
# ==========================================
DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY', '')
DEEPSEEK_API_URL = os.getenv('DEEPSEEK_API_URL', 'https://api.deepseek.com/v1')

# API调用限制配置
DEEPSEEK_CONFIG = {
    'daily_base_limit': 400,      # 基础日调用上限
    'daily_peak_limit': 800,      # 峰值日调用上限
    'monthly_limit': 20000,       # 月调用上限
    'dynamic_scaling': {
        'enabled': True,
        'scale_up_threshold': 0.8,
        'scale_up_factor': 1.5,
        'max_daily_limit': 1200,  # 单日最大上限
        'cooldown_period': 86400,  # 24小时冷却期
    },
    'circuit_breaker': {
        'enabled': True,
        'failure_threshold': 10,
        'reset_timeout': 3600,     # 1小时
        'half_open_max_calls': 3,
        'success_threshold': 2,
    },
    'priority_queue': {
        'enabled': True,
        'tiers': [
            {
                'level': 'P0',
                'count': 7,
                'universities': ['清华大学', '北京大学', '复旦大学', '上海交通大学', '浙江大学', '中国科学技术大学', '南京大学'],
                'crawl_interval': 7200,    # 每2小时
                'max_age': 0,
                'weight': 10,
            },
            {
                'level': 'P1',
                'count': 39,
                'universities': '985院校',
                'crawl_interval': 14400,   # 每4小时
                'max_age': 3600,           # 1小时内处理
                'weight': 5,
            },
            {
                'level': 'P2',
                'count': 77,
                'universities': '211院校（非985）',
                'crawl_interval': 21600,   # 每6小时
                'max_age': 7200,           # 2小时内处理
                'weight': 3,
            },
            {
                'level': 'P3',
                'count': 243,
                'universities': '其他保研院校',
                'crawl_interval': 43200,   # 每12小时
                'max_age': 14400,          # 4小时内处理
                'weight': 1,
            },
        ],
    },
    'cost_control': {
        'daily_budget': 80,          # 日预算80元
        'monthly_budget': 1500,      # 月预算1500元
        'alert_threshold': 0.8,      # 80%告警
    },
}

# ==========================================
# 爬虫调度配置
# ==========================================
# 调度器类
SCHEDULER = 'baoyan_crawler.scheduler.PriorityScheduler'

# 去重类
DUPEFILTER_CLASS = 'baoyan_crawler.dupefilter.RedisDupeFilter'

# 调度持久化
SCHEDULER_PERSIST = True

# 调度队列刷新间隔
SCHEDULER_FLUSH_ON_START = False

# ==========================================
# 代理配置
# ==========================================
# 代理池（待配置）
PROXY_POOL = []

# 代理切换策略
PROXY_SWITCH_POLICY = 'random'

# ==========================================
# 用户代理配置
# ==========================================
USER_AGENT_LIST = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
]

# ==========================================
# 自动限速配置
# ==========================================
AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 30
AUTOTHROTTLE_MAX_DELAY = 120
AUTOTHROTTLE_TARGET_CONCURRENCY = 1.0
AUTOTHROTTLE_DEBUG = False

# ==========================================
# 缓存配置
# ==========================================
HTTPCACHE_ENABLED = True
HTTPCACHE_EXPIRATION_SECS = 3600  # 1小时缓存
HTTPCACHE_DIR = 'httpcache'
HTTPCACHE_IGNORE_HTTP_CODES = []
HTTPCACHE_STORAGE = 'scrapy.extensions.httpcache.FilesystemCacheStorage'

# ==========================================
# 请求头配置
# ==========================================
DEFAULT_REQUEST_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
}

# ==========================================
# 编码配置
# ==========================================
FEED_EXPORT_ENCODING = 'utf-8'

# ==========================================
# 警告配置
# ==========================================
# 禁用Scrapy的telnet控制台警告
TELNETCONSOLE_ENABLED = False

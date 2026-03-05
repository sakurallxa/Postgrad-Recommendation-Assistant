import scrapy


class CampInfoItem(scrapy.Item):
    """
    招生公告Item（夏令营/预推免）
    用于存储爬取的公告信息
    """
    
    # 基本信息
    title = scrapy.Field()          # 标题
    announcement_type = scrapy.Field()  # 公告类型 summer_camp/pre_recommendation
    university_id = scrapy.Field()  # 院校ID
    source_url = scrapy.Field()     # 原文链接
    
    # 时间信息
    publish_date = scrapy.Field()   # 发布日期
    deadline = scrapy.Field()       # 截止日期
    start_date = scrapy.Field()     # 开始日期
    end_date = scrapy.Field()       # 结束日期
    
    # 详细信息
    requirements = scrapy.Field()   # 申请要求 (JSON)
    materials = scrapy.Field()      # 所需材料 (JSON数组)
    process = scrapy.Field()        # 报名流程 (JSON数组)
    contact = scrapy.Field()        # 联系方式 (JSON)
    content = scrapy.Field()        # 原始内容
    
    # 元数据
    confidence = scrapy.Field()     # 置信度 (0-1)
    crawl_time = scrapy.Field()     # 爬取时间
    spider_name = scrapy.Field()    # 爬虫名称


class UniversityItem(scrapy.Item):
    """
    院校信息Item
    用于存储院校基本信息
    """
    
    id = scrapy.Field()             # 院校ID
    name = scrapy.Field()           # 院校名称
    logo = scrapy.Field()           # Logo
    region = scrapy.Field()         # 地区
    level = scrapy.Field()          # 985/211/双一流/普通
    website = scrapy.Field()        # 官网
    grad_website = scrapy.Field()   # 研究生院官网
    priority = scrapy.Field()       # 优先级 P0/P1/P2/P3


class CrawlerLogItem(scrapy.Item):
    """
    爬虫日志Item
    用于记录爬虫执行情况
    """
    
    university_id = scrapy.Field()  # 院校ID
    status = scrapy.Field()         # 状态 success/failed/running
    start_time = scrapy.Field()     # 开始时间
    end_time = scrapy.Field()       # 结束时间
    error_msg = scrapy.Field()      # 错误信息
    items_count = scrapy.Field()    # 采集数量

import scrapy
import json
import re
from datetime import datetime, timedelta
from urllib.parse import urljoin, urlparse
from ..items import CampInfoItem


class UniversitySpider(scrapy.Spider):
    """
    院校招生公告爬虫（夏令营/预推免）
    支持366所保研院校的研究生院网站爬取
    """
    
    name = 'university'
    
    # 366所院校爬虫配置
    custom_settings = {
        'DOWNLOAD_DELAY': 30,  # 每30秒一个请求
        'CONCURRENT_REQUESTS_PER_DOMAIN': 1,
        'RETRY_TIMES': 3,
        'RETRY_HTTP_CODES': [500, 502, 503, 504, 408, 429],
    }
    
    def __init__(self, university_id=None, priority=None, year_span=3, **kwargs):
        """
        初始化爬虫
        :param university_id: 指定院校ID
        :param priority: 指定优先级(P0/P1/P2/P3)
        """
        super().__init__(**kwargs)
        self.university_id = university_id
        self.priority = priority
        try:
            parsed_span = int(year_span)
        except (TypeError, ValueError):
            parsed_span = 3
        self.year_span = max(1, min(parsed_span, 5))
        current_year = datetime.now().year
        self.target_years = [current_year - i for i in range(self.year_span)]
        
    def start_requests(self):
        """生成初始请求"""
        # 从数据库或配置加载院校列表
        universities = self.load_universities()
        
        for uni in universities:
            # 构建研究生院招生信息页面URL
            urls = self.build_urls(uni)
            
            for url_info in urls:
                yield scrapy.Request(
                    url=url_info['url'],
                    callback=self.parse_list,
                    meta={
                        'university': uni,
                        'url_type': url_info['type'],
                        'depth': 0,
                    },
                    errback=self.handle_error,
                )
    
    def load_universities(self):
        """加载院校列表"""
        # 从数据库或配置文件加载
        # 这里使用示例数据
        universities = [
            {
                'id': 'tsinghua',
                'name': '清华大学',
                'priority': 'P0',
                'website': 'https://www.tsinghua.edu.cn',
                'grad_website': 'https://yz.tsinghua.edu.cn',
            },
            {
                'id': 'pku',
                'name': '北京大学',
                'priority': 'P0',
                'website': 'https://www.pku.edu.cn',
                'grad_website': 'https://admission.pku.edu.cn',
            },
            # 更多院校...
        ]
        
        # 根据条件筛选
        if self.university_id:
            universities = [u for u in universities if u['id'] == self.university_id]
        if self.priority:
            universities = [u for u in universities if u['priority'] == self.priority]
            
        return universities
    
    def build_urls(self, university):
        """构建爬取URL列表"""
        urls = []
        base_url = university.get('grad_website', university['website'])
        
        # 常见的招生公告页面路径
        common_paths = [
            '/zsxx/ssszs/camp/',
            '/zsxx/ssszs/tuimian/',
            '/admission/',
            '/zsxx/',
            '/info/',
        ]
        
        for path in common_paths:
            urls.append({
                'url': urljoin(base_url, path),
                'type': 'list',
            })
        
        return urls
    
    def parse_list(self, response):
        """解析列表页"""
        university = response.meta['university']
        depth = response.meta.get('depth', 0)
        
        self.logger.info(f"解析列表页: {response.url} - {university['name']}")
        
        # 提取招生公告链接（夏令营/预推免）
        camp_links = self.extract_camp_links(response)
        
        for link in camp_links:
            yield scrapy.Request(
                url=link['url'],
                callback=self.parse_detail,
                meta={
                    'university': university,
                    'title': link['title'],
                    'announcement_type': link.get('announcement_type'),
                },
            )
        
        # 处理分页
        if depth < 3:  # 最多爬取3页
            next_page = self.extract_next_page(response)
            if next_page:
                yield scrapy.Request(
                    url=next_page,
                    callback=self.parse_list,
                    meta={
                        'university': university,
                        'depth': depth + 1,
                    },
                )
    
    def extract_camp_links(self, response):
        """提取招生公告链接"""
        links = []
        
        # 使用多种选择器策略
        selectors = [
            '//a[contains(@href, "camp") or contains(@title, "夏令营")]',
            '//a[contains(text(), "夏令营")]',
            '//a[contains(text(), "暑期学校")]',
            '//a[contains(text(), "预推免")]',
            '//a[contains(text(), "推免")]',
            '//a[contains(@href, "tuimian")]',
            '//a[contains(@href, "recommend")]',
        ]
        
        for selector in selectors:
            nodes = response.xpath(selector)
            for node in nodes:
                href = node.xpath('./@href').get()
                if not href:
                    continue
                title = ''.join(node.xpath('.//text()').getall()).strip()
                title_attr = node.xpath('./@title').get()
                if title_attr:
                    title = f"{title} {title_attr}".strip()
                url = urljoin(response.url, href)
                # 过滤无效链接
                if self.is_valid_url(url) and self.is_target_year_text(f'{title} {url}'):
                    announcement_type = self.detect_announcement_type(title, url, '')
                    links.append({
                        'url': url,
                        'title': title,
                        'announcement_type': announcement_type,
                    })
        
        # 去重
        seen = set()
        unique_links = []
        for link in links:
            if link['url'] not in seen:
                seen.add(link['url'])
                unique_links.append(link)
        
        return unique_links[:10]  # 每页最多10条
    
    def is_valid_url(self, url):
        """验证URL是否有效"""
        parsed = urlparse(url)
        
        # 排除非HTTP协议
        if parsed.scheme not in ['http', 'https']:
            return False
        
        # 排除常见无效后缀
        invalid_extensions = ['.pdf', '.doc', '.docx', '.jpg', '.png', '.zip']
        if any(url.lower().endswith(ext) for ext in invalid_extensions):
            return False
        
        return True
    
    def extract_next_page(self, response):
        """提取下一页链接"""
        # 常见的分页选择器
        next_selectors = [
            '//a[contains(text(), "下一页")]/@href',
            '//a[contains(@class, "next")]/@href',
            '//a[@rel="next"]/@href',
        ]
        
        for selector in next_selectors:
            next_url = response.xpath(selector).get()
            if next_url:
                return urljoin(response.url, next_url)
        
        return None
    
    def parse_detail(self, response):
        """解析详情页"""
        university = response.meta['university']
        link_title = response.meta.get('title', '').strip()
        meta_type = response.meta.get('announcement_type')
        
        self.logger.info(f"解析详情页: {response.url} - {university['name']}")
        
        # 提取页面内容
        content = self.extract_content(response)
        
        # 使用AI提取结构化信息
        camp_info = self.extract_with_ai(content, university)
        
        if camp_info and self.is_within_target_year(camp_info, content, response):
            title = camp_info.get('title', '').strip() or link_title or response.xpath('//title/text()').get(default='').strip()
            announcement_type = camp_info.get('announcement_type') or meta_type or self.detect_announcement_type(title, response.url, content)
            item = CampInfoItem()
            item['title'] = title
            item['announcement_type'] = announcement_type
            item['university_id'] = university['id']
            item['source_url'] = response.url
            item['publish_date'] = camp_info.get('publish_date')
            item['deadline'] = camp_info.get('deadline')
            item['start_date'] = camp_info.get('start_date')
            item['end_date'] = camp_info.get('end_date')
            item['requirements'] = camp_info.get('requirements', {})
            item['materials'] = camp_info.get('materials', [])
            item['process'] = camp_info.get('process', [])
            item['contact'] = camp_info.get('contact', {})
            item['content'] = content
            
            yield item

    def is_target_year_text(self, text):
        """快速判断文本是否落在目标年份窗口"""
        normalized = (text or '').strip()
        if not normalized:
            return False

        for year in self.target_years:
            short_year = str(year)[-2:]
            if str(year) in normalized or f'{short_year}年' in normalized:
                return True

        # 未识别年份但具备目标关键词时保留，详情页再做二次过滤
        keywords = ['夏令营', '暑期学校', '预推免', '推免', '推荐免试']
        return any(keyword in normalized for keyword in keywords)

    def detect_announcement_type(self, title='', url='', content=''):
        """识别公告类型：summer_camp/pre_recommendation"""
        merged_text = ' '.join([title or '', url or '', content[:500] if content else ''])

        pre_patterns = [
            r'预推免',
            r'推免生',
            r'推荐免试',
            r'推免(?!夏令营)',
            r'tuimian',
        ]
        for pattern in pre_patterns:
            if re.search(pattern, merged_text, re.IGNORECASE):
                return 'pre_recommendation'

        return 'summer_camp'

    def is_within_target_year(self, camp_info, content, response):
        """详情页二次年份过滤：优先结构化日期，其次正文/标题关键词"""
        date_fields = [
            camp_info.get('publish_date'),
            camp_info.get('deadline'),
            camp_info.get('start_date'),
            camp_info.get('end_date'),
        ]

        for value in date_fields:
            if not value:
                continue
            try:
                year = datetime.fromisoformat(value).year
                if year in self.target_years:
                    return True
            except Exception:
                continue

        merged_text = ' '.join([
            camp_info.get('title', ''),
            response.url,
            content[:500] if content else '',
        ])
        return self.is_target_year_text(merged_text)
    
    def extract_content(self, response):
        """提取页面正文内容"""
        # 移除脚本和样式
        response.selector.remove_namespaces()
        
        # 尝试多种内容选择器
        content_selectors = [
            '//div[@class="content-detail"]//text()',
            '//div[@class="article-content"]//text()',
            '//div[@id="content"]//text()',
            '//article//text()',
            '//body//text()',
        ]
        
        for selector in content_selectors:
            texts = response.xpath(selector).getall()
            content = '\n'.join(t.strip() for t in texts if t.strip())
            if len(content) > 100:  # 内容足够长
                return content
        
        return ''
    
    def extract_with_ai(self, content, university):
        """使用AI提取结构化信息"""
        # 这里调用DeepSeek API进行信息提取
        # 简化版本：使用正则提取
        
        camp_info = {
            'title': self.extract_title(content),
            'announcement_type': self.detect_announcement_type('', '', content),
            'publish_date': self.extract_date(content, '发布'),
            'deadline': self.extract_date(content, '截止'),
            'start_date': self.extract_date(content, '开始'),
            'end_date': self.extract_date(content, '结束'),
            'requirements': self.extract_requirements(content),
            'materials': self.extract_materials(content),
            'process': self.extract_process(content),
            'contact': self.extract_contact(content),
        }
        
        return camp_info
    
    def extract_title(self, content):
        """提取标题"""
        patterns = [
            r'[^。\n]*(?:夏令营|暑期学校)[^。\n]*',
            r'[^。\n]*(?:预推免|推免生|推荐免试|推免)[^。\n]*',
        ]
        for pattern in patterns:
            matches = re.findall(pattern, content)
            if matches:
                return matches[0][:100]  # 限制长度
        return ''
    
    def extract_date(self, content, keyword):
        """提取日期"""
        # 匹配各种日期格式
        patterns = [
            rf'{keyword}.*?([0-9]{{4}}年[0-9]{{1,2}}月[0-9]{{1,2}}日)',
            rf'{keyword}.*?([0-9]{{4}}-[0-9]{{1,2}}-[0-9]{{1,2}})',
            rf'{keyword}.*?([0-9]{{4}}/[0-9]{{1,2}}/[0-9]{{1,2}})',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, content)
            if match:
                date_str = match.group(1)
                try:
                    # 标准化日期格式
                    date_str = date_str.replace('年', '-').replace('月', '-').replace('日', '')
                    return datetime.strptime(date_str, '%Y-%m-%d').isoformat()
                except:
                    pass
        
        return None
    
    def extract_requirements(self, content):
        """提取申请要求"""
        requirements = {}
        
        # 成绩要求
        grade_match = re.search(r'成绩.*?前([0-9]+)%', content)
        if grade_match:
            requirements['grade_rank'] = f'前{grade_match.group(1)}%'
        
        # 英语要求
        english_match = re.search(r'CET-6.*?([0-9]+)', content)
        if english_match:
            requirements['english'] = f'CET-6 {english_match.group(1)}分以上'
        
        return requirements
    
    def extract_materials(self, content):
        """提取所需材料"""
        materials = []
        
        material_keywords = [
            '申请表', '个人陈述', '成绩单', '获奖证书',
            '推荐信', '英语水平证明', '身份证复印件', '学生证',
        ]
        
        for keyword in material_keywords:
            if keyword in content:
                materials.append(keyword)
        
        return materials
    
    def extract_process(self, content):
        """提取报名流程"""
        process = []
        
        # 查找流程描述
        process_patterns = [
            r'流程[：:]([^。]+)',
            r'步骤[：:]([^。]+)',
        ]
        
        for pattern in process_patterns:
            match = re.search(pattern, content)
            if match:
                steps = match.group(1).split('→')
                process = [s.strip() for s in steps if s.strip()]
                break
        
        return process

    def extract_contact(self, content):
        """提取联系方式（邮箱/电话/地址）"""
        contact = {}

        email_match = re.search(r'([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', content)
        if email_match:
            contact['email'] = email_match.group(1)

        phone_match = re.search(r'((?:0\d{2,3}-?)?\d{7,8}(?:-\d+)?|1[3-9]\d{9})', content)
        if phone_match:
            contact['phone'] = phone_match.group(1)

        address_match = re.search(
            r'(北京市|上海市|天津市|重庆市|[^\s，。；]{2,8}省[^\s，。；]{2,20}(?:市|区|县)?|[^\s，。；]{2,10}市[^\s，。；]{2,20}(?:区|县)?)',
            content,
        )
        if address_match:
            contact['address'] = address_match.group(1)

        return contact
    
    def handle_error(self, failure):
        """处理请求错误"""
        self.logger.error(f"请求失败: {failure.request.url}")
        self.logger.error(f"错误信息: {failure.value}")

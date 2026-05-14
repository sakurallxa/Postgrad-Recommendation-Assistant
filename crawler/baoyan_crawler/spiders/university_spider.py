import scrapy
import json
import re
import os
from datetime import datetime, timedelta
from urllib.parse import urljoin, urlparse
import requests
from ..items import CampInfoItem


class UniversitySpider(scrapy.Spider):
    """
    院校招生公告爬虫（夏令营/预推免）
    默认覆盖后端院校表中的 P0/P1/P2 学校
    """
    
    name = 'university'
    build_tag = os.getenv('CRAWLER_BUILD_TAG', 'focus5-drop-reasons-v2')
    backend_base_url = os.getenv('BACKEND_BASE_URL', 'http://127.0.0.1:3000').rstrip('/')
    default_priority_scope = {'P0', 'P1', 'P2'}
    default_crawl_overrides = [
        {
            'slug': 'tsinghua',
            'name': '清华大学',
            'priority': 'P0',
            'website': 'https://www.tsinghua.edu.cn',
            'grad_website': 'https://yz.tsinghua.edu.cn',
            'entry_points': [
                'https://yz.tsinghua.edu.cn/xlyxx.htm',
                'https://yz.tsinghua.edu.cn/zxgg.htm',
                'https://yz.tsinghua.edu.cn/info/1024/3038.htm',
                'https://yz.tsinghua.edu.cn/info/1024/3125.htm',
            ],
            'strict_entry_points': True,
        },
        {
            'slug': 'pku',
            'name': '北京大学',
            'priority': 'P0',
            'website': 'https://www.pku.edu.cn',
            'grad_website': 'https://admission.pku.edu.cn',
            'entry_points': [
                'https://admission.pku.edu.cn/xly/index.htm',
                'https://admission.pku.edu.cn/tzgg/index.htm',
                'https://admission.pku.edu.cn/zsxx/index.htm',
                'https://admission.pku.edu.cn/',
            ],
            'strict_entry_points': True,
        },
        {
            'slug': 'fudan',
            'name': '复旦大学',
            'priority': 'P0',
            'website': 'https://www.fudan.edu.cn',
            'grad_website': 'https://gsao.fudan.edu.cn',
            'entry_points': [
                'https://gsao.fudan.edu.cn/sszs/list.htm',
                'https://gsao.fudan.edu.cn/sszs/14538/list.htm',
                'https://gsao.fudan.edu.cn/main.htm',
            ],
            'strict_entry_points': True,
        },
        {
            'slug': 'sjtu',
            'name': '上海交通大学',
            'priority': 'P0',
            'website': 'https://www.sjtu.edu.cn',
            'grad_website': 'https://yzb.sjtu.edu.cn',
            'entry_points': [
                'https://yzb.sjtu.edu.cn/',
                'https://yzb.sjtu.edu.cn/post/3216',
                'https://yzb.sjtu.edu.cn/post/3209',
                'https://yzb.sjtu.edu.cn/post/3206',
                'https://yzb.sjtu.edu.cn/post/3220',
            ],
            'strict_entry_points': True,
        },
    ]
    positive_keywords = [
        '夏令营',
        '暑期学校',
        '优秀大学生',
        '推免',
        '预推免',
        '推荐免试',
        '免试攻读研究生',
        '免试攻读',
        '推免生',
        '直博',
        '预报名',
    ]
    negative_keywords = [
        '港澳台',
        # NOTE: do NOT use bare "博士"/"博士生" — they match legitimate "硕博联合夏令营",
        # "工程硕博士专项", "推免直博" content. Use full doctoral-program markers instead.
        '博士招生简章',
        '博士研究生招生',
        '博士生招生章程',
        # "申请考核" is a separate doctoral track (for masters → doctorate), not 推免/夏令营
        '申请-考核',
        '申请考核制博士',
        '招生目录',
        '专业目录',
        '成绩查询',
        '考前提醒',
        '报名须知',
        '考试报名',
        # NOTE: removed "网上报名" — too common, appears in legitimate 夏令营/推免 instructions
        '网上确认',
        '报考点',
        '准考证',
        '初试成绩',
        '统考',
    ]
    weak_titles = {
        '夏令营',
        '夏令营/推免',
        '推免',
        '预推免',
        '推荐免试',
    }
    noisy_url_keywords = [
        'gat',
        'gangao',
        'boshi',
        'bs',
        'lxs',
        'got',
        'zsml',
        'sszs',
        'chaxun',
        'kaoqian',
    ]
    system_page_patterns = [
        '/login',
        '/signin',
        '/logon',
        'user/login',
        'user/login.php',
        'user/login.do',
        'common/login',
        'accountservice/',
        'redirecturl=',
        'signin.aspx',
        'login.do',
        'login.html',
    ]
    generic_blocked_candidate_url_patterns = [
        'download.jsp',
        'dd_article_attachment',
        'wbfileid=',
        '/system/_content/download',
        '/zsxt',
        '/zsgl',
        'default.aspx',
        'login',
    ]
    list_navigation_keywords = [
        '研究生',
        '招生',
        '招考',
        '招办',
        '推免',
        '推荐免试',
        '预推免',
        '夏令营',
        '暑期学校',
        '免试攻读',
    ]
    list_navigation_url_keywords = [
        'graduate',
        'admission',
        'yjs',
        'yz',
        'yzb',
        'zhaosheng',
        'sszs',
        'tuimian',
        'recommend',
        'xly',
        'tm',
    ]
    generic_detail_url_keywords = [
        '/info/',
        '/article/',
        '/notice/',
        '/tzgg/',
        '/detail',
        '/view',
        '/show',
        '/content',
        '/page',
        '/pages/',
        '/list/',
    ]
    dead_detail_urls = {
        'https://www.im.pku.edu.cn/zsxm/ssxm/390140.htm',
        'https://www.pkufh.com/Html/News/Articles/62699.html',
        'https://ssyjsbm.xmu.edu.cn/user/login.php?act=login',
        'http://hityzb.hit.edu.cn/zhxy-yjs-zs_v2/common/login?redirectUrl=/pc/tms/index',
        'http://202.113.8.92/gstms/examineeIndex.action',
        'https://yzb.tju.edu.cn/xwzx/zxxx/202506/t20250630_324321.htm',
        'https://yzb.tju.edu.cn/xwzx/tztg/202406/t20240607_323819.htm',
        'https://yzb.tju.edu.cn/zszn/bkbd/201805/t20180523_306990.html',
        'https://yzb.tju.edu.cn/xwzx/tztg/201805/t20180518_306777.htm',
    }
    title_prefix_labels = [
        '学工动态',
        '工作动态',
        '医学教育',
        '通知公告',
        '新闻动态',
        '招生信息',
        '招生通知',
        '信息来源',
    ]
    title_suffix_labels = [
        '学工动态',
        '工作动态',
        '医学教育',
        '通知公告',
        '新闻动态',
    ]
    default_site_rule = {
        'hosts': [],
        'fallback_location': None,
        'fallback_keywords': [],
        'location_labels': ['活动地点', '举办地点', '营期地点', '报到地点', '线下地点', '活动安排地点'],
        'deadline_labels': ['报名截止时间', '报名截止日期', '截止时间', '截止日期', '申请截止', '网申截止'],
        'event_labels': ['活动时间', '举办时间', '营期时间', '夏令营时间', '夏令营暂定时间', '时间安排', '活动安排', '报到时间'],
    }
    site_specific_rules = [
        {
            'hosts': ['sps.bjmu.edu.cn', 'shh.bjmu.edu.cn', 'sbms.bjmu.edu.cn', 'imt.bjmu.edu.cn'],
            'fallback_location': '北京市海淀区学院路38号北京大学医学部',
            'fallback_keywords': ['北大医学部', '线下进行', '线下方式', '线下形式', '学院路38号', '逸夫楼', '药学楼', '生化楼'],
            'location_labels': ['报到地点', '线下地点', '活动安排地点', '地点安排'],
            'deadline_labels': ['网申截止', '系统开放时间', '网上申报截止时间', '报名截止时间'],
            'event_labels': ['活动时间', '举办时间', '营期时间', '夏令营时间', '报到时间'],
        },
        {
            'hosts': ['pkuh6.cn'],
            'fallback_location': '北京市海淀区花园北路51号北京大学第六医院海淀院区',
            'fallback_keywords': ['海淀院区', '花园北路51号', '线下', '线下进行', '线下方式', '线下形式', '线下参加', '全程线下', '第六医院'],
            'location_labels': ['报到地点', '活动地点', '举办地点'],
            'deadline_labels': ['报名截止时间', '报名截止', '截止时间'],
            'event_labels': ['活动时间', '举办时间', '报到时间'],
        },
        {
            'hosts': ['www.pkufh.com', 'pkufh.com'],
            'fallback_location': '北京市西城区西什库大街8号北京大学第一医院',
            'fallback_keywords': ['北大医院', '第一医院', '线下', '线下方式', '线下形式', '线下参加', '全程线下', '西什库大街8号'],
            'location_labels': ['报到地点', '活动地点', '举办地点'],
            'deadline_labels': ['报名截止时间', '报名截止', '截止时间'],
            'event_labels': ['活动时间', '举办时间', '报到时间'],
        },
        {
            'hosts': ['www.pkuph.cn', 'pkuph.cn'],
            'fallback_location': '北京市西城区西直门南大街11号北京大学人民医院西直门院区',
            'fallback_keywords': ['西直门院区', '线下进行', '线下方式', '线下形式', '人民医院'],
            'location_labels': ['报到地点', '活动地点', '举办地点'],
            'deadline_labels': ['报名截止时间', '报名截止', '截止时间'],
            'event_labels': ['活动时间', '举办时间', '报到时间'],
        },
    ]
    
    # 院校爬虫配置
    custom_settings = {
        'DOWNLOAD_DELAY': 30,  # 每30秒一个请求
        'CONCURRENT_REQUESTS_PER_DOMAIN': 1,
        'RETRY_TIMES': 3,
        'RETRY_HTTP_CODES': [500, 502, 503, 504, 408, 429],
        'USER_AGENT': (
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
            'AppleWebKit/537.36 (KHTML, like Gecko) '
            'Chrome/136.0.0.0 Safari/537.36'
        ),
    }
    
    def __init__(self, university_id=None, priority=None, year_span=3, **kwargs):
        """
        初始化爬虫
        :param university_id: 指定院校ID
        :param priority: 指定优先级(P0/P1/P2/P3)
        """
        super().__init__(**kwargs)
        self.university_id = university_id
        self.university_targets = {
            item.strip()
            for item in (university_id or '').split(',')
            if item and item.strip()
        }
        self.priority = priority
        try:
            parsed_span = int(year_span)
        except (TypeError, ValueError):
            parsed_span = 3
        self.year_span = max(1, min(parsed_span, 5))
        current_year = datetime.now().year
        self.target_years = [current_year - i for i in range(self.year_span)]
        try:
            self.backend_timeout_seconds = int(
                os.getenv('CRAWLER_BACKEND_TIMEOUT_SECONDS', '30')
            )
        except (TypeError, ValueError):
            self.backend_timeout_seconds = 30
        self.crawl_overrides = self.load_crawl_overrides()
        self.site_specific_rules = self.load_site_rule_aliases()
        self.site_crawl_rules = self.load_site_crawl_rules()
        self.batch_started_at = datetime.utcnow()
        self.summary_dir = os.path.join(os.getcwd(), 'logs')
        os.makedirs(self.summary_dir, exist_ok=True)
        stamp = self.batch_started_at.strftime('%Y%m%d_%H%M%S')
        priority_tag = (self.priority or 'P0_P1_P2').replace('/', '_')
        self.summary_path = os.path.join(
            self.summary_dir,
            f'crawler_summary_{priority_tag}_{stamp}.json'
        )
        self._last_summary_flush_at = None
        self._summary_flush_interval_seconds = 15
        self.batch_summary = {
            'startedAt': self.batch_started_at.isoformat(),
            'buildTag': self.build_tag,
            'priority': self.priority or 'P0_P1_P2',
            'targetYears': self.target_years,
            'schools': {},
            'failedHosts': {},
            'reason': None,
            'ingest': {},
        }

    def build_batch_totals(self):
        totals = {
            'plannedEntryCount': 0,
            'listPagesVisited': 0,
            'detailCandidates': 0,
            'detailPagesVisited': 0,
            'detailsFiltered': 0,
            'itemsEmitted': 0,
            'requestErrors': 0,
        }
        for school in self.batch_summary['schools'].values():
            for key in totals.keys():
                totals[key] += int(school.get(key) or 0)
        return totals

    def flush_batch_summary(self, force=False, reason=None):
        now = datetime.utcnow()
        if not force and self._last_summary_flush_at is not None:
            elapsed = (now - self._last_summary_flush_at).total_seconds()
            if elapsed < self._summary_flush_interval_seconds:
                return

        self.batch_summary['finishedAt'] = now.isoformat()
        self.batch_summary['durationSeconds'] = int((now - self.batch_started_at).total_seconds())
        if reason:
            self.batch_summary['reason'] = reason
        self.batch_summary['ingest'] = getattr(self, 'ingest_summary', {})
        self.batch_summary['schoolCount'] = len(self.batch_summary['schools'])
        self.batch_summary['totals'] = self.build_batch_totals()
        self.batch_summary['failedHosts'] = dict(
            sorted(
                self.batch_summary['failedHosts'].items(),
                key=lambda item: item[1],
                reverse=True,
            )[:50]
        )

        with open(self.summary_path, 'w', encoding='utf-8') as fh:
            json.dump(self.batch_summary, fh, ensure_ascii=False, indent=2)
        self._last_summary_flush_at = now

    def load_crawl_overrides(self):
        overrides_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), '..', '..', '..', 'shared', 'crawl-overrides.json')
        )
        rows = []
        if os.path.exists(overrides_path):
            try:
                with open(overrides_path, 'r', encoding='utf-8') as fh:
                    payload = json.load(fh)
                if isinstance(payload, list):
                    rows = payload
            except Exception as exc:
                self.logger.warning(f'加载 crawl overrides 失败: {exc}')

        normalized = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            normalized.append({
                'slug': row.get('slug') or '',
                'name': row.get('name') or '',
                'priority': row.get('priority') or 'P2',
                'website': row.get('website') or '',
                'grad_website': row.get('gradWebsite') or row.get('grad_website') or row.get('website') or '',
                'entry_points': row.get('entryPoints') or row.get('entry_points') or [],
                'strict_entry_points': bool(
                    row.get('strictEntryPoints')
                    or row.get('strict_entry_points')
                ),
            })

        if normalized:
            return normalized
        return list(self.default_crawl_overrides)

    def load_site_rule_aliases(self):
        aliases_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), '..', '..', '..', 'shared', 'site-rule-aliases.json')
        )
        try:
            with open(aliases_path, 'r', encoding='utf-8') as fh:
                rows = json.load(fh)
            return rows if isinstance(rows, list) else []
        except Exception as exc:
            self.logger.warning(f'加载站点规则别名失败: {exc}')
            return []

    def load_site_crawl_rules(self):
        rules_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), '..', '..', '..', 'shared', 'site-crawl-rules.json')
        )
        try:
            with open(rules_path, 'r', encoding='utf-8') as fh:
                payload = json.load(fh)
            if not isinstance(payload, dict):
                return {
                    'listPagePatterns': [],
                    'detailAllowRules': [],
                    'linkSelectors': {},
                    'titleSelectors': {},
                    'blockedDetailHosts': [],
                    'blockedLinkPatterns': {},
                    'candidateAllowPatterns': {},
                    'directDetailPatterns': {},
                    'contentSelectors': {},
                }
            return {
                'listPagePatterns': payload.get('listPagePatterns') or [],
                'detailAllowRules': payload.get('detailAllowRules') or [],
                'linkSelectors': payload.get('linkSelectors') or {},
                'titleSelectors': payload.get('titleSelectors') or {},
                'blockedDetailHosts': payload.get('blockedDetailHosts') or [],
                'blockedLinkPatterns': payload.get('blockedLinkPatterns') or {},
                'candidateAllowPatterns': payload.get('candidateAllowPatterns') or {},
                'directDetailPatterns': payload.get('directDetailPatterns') or {},
                'directDetailFallbacks': payload.get('directDetailFallbacks') or {},
                'contentSelectors': payload.get('contentSelectors') or {},
            }
        except Exception as exc:
            self.logger.warning(f'加载站点抓取规则失败: {exc}')
            return {
                'listPagePatterns': [],
                'detailAllowRules': [],
                'linkSelectors': {},
                'titleSelectors': {},
                'blockedDetailHosts': [],
                'blockedLinkPatterns': {},
                'candidateAllowPatterns': {},
                'directDetailPatterns': {},
                'directDetailFallbacks': {},
                'contentSelectors': {},
            }
        
    def start_requests(self):
        """生成初始请求"""
        # 从数据库或配置加载院校列表
        universities = self.load_universities()
        self.batch_summary['plannedUniversityCount'] = len(universities)
        
        for uni in universities:
            # 构建研究生院招生信息页面URL
            urls = self.build_urls(uni)
            school = self.get_school_summary(uni)
            school['plannedEntryCount'] = len(urls)
            school['plannedEntryUrls'] = [item['url'] for item in urls[:20]]
            
            for url_info in urls:
                yield scrapy.Request(
                    url=url_info['url'],
                    callback=self.parse_list,
                    meta={
                        'university': uni,
                        'url_type': url_info['type'],
                        'depth': 0,
                        'stage': 'list',
                    },
                    errback=self.handle_error,
                )
    
    def load_universities(self):
        """加载院校列表"""
        universities = self.fetch_universities_from_backend()
        if not universities:
            universities = self.build_fallback_universities()

        if self.university_targets:
            universities = [
                u for u in universities
                if u.get('id') in self.university_targets or u.get('slug') in self.university_targets
            ]
        if self.priority:
            universities = [u for u in universities if u['priority'] == self.priority]
        else:
            universities = [u for u in universities if u.get('priority') in self.default_priority_scope]

        return universities

    def apply_default_strict_policy(self, university):
        normalized = dict(university)
        priority = normalized.get('priority')
        entry_points = [item for item in (normalized.get('entry_points') or []) if item]
        website = (normalized.get('website') or '').strip()

        if priority == 'P2' and not normalized.get('strict_entry_points'):
            normalized['strict_entry_points'] = True
            if not entry_points and website:
                entry_points = [website.rstrip('/') + '/']

        normalized['entry_points'] = entry_points
        return normalized

    def fetch_universities_from_backend(self):
        """从后端拉取真实院校列表，默认扩展到全部 P0/P1/P2 学校。"""
        try:
            rows = []
            page = 1
            total_pages = 1
            while page <= total_pages:
                resp = requests.get(
                    (
                        f'{self.backend_base_url}/api/v1/universities'
                        f'?page={page}&limit=100&sortBy=priority&sortOrder=asc'
                    ),
                    timeout=max(5, self.backend_timeout_seconds),
                )
                resp.raise_for_status()
                payload = resp.json()
                page_rows = payload.get('data') if isinstance(payload, dict) else []
                meta = payload.get('meta') if isinstance(payload, dict) else {}
                if not page_rows:
                    break
                rows.extend(page_rows)
                total_pages = int(meta.get('totalPages') or 1)
                page += 1
            if not rows:
                return []

            override_map = {
                item['name']: item
                for item in self.crawl_overrides
            }
            universities = []
            seen_names = set()
            for row in rows:
                name = str(row.get('name') or '').strip()
                university_id = row.get('id')
                priority = row.get('priority')
                website = row.get('website')
                if not name or not university_id:
                    continue
                if priority not in self.default_priority_scope:
                    continue
                if not website:
                    self.logger.info(f'跳过缺少官网地址的院校: {name}')
                    continue
                override = override_map.get(name, {})
                universities.append(self.apply_default_strict_policy({
                    'id': university_id,
                    'slug': override.get('slug') or university_id,
                    'name': name,
                    'priority': priority,
                    'website': website,
                    'grad_website': override.get('grad_website') or website,
                    'entry_points': override.get('entry_points') or [],
                    'strict_entry_points': bool(override.get('strict_entry_points')),
                }))
                seen_names.add(name)

            for override in self.crawl_overrides:
                name = str(override.get('name') or '').strip()
                if not name or name in seen_names:
                    continue
                if override.get('priority') not in self.default_priority_scope:
                    continue
                website = override.get('website')
                if not website:
                    continue
                universities.append(self.apply_default_strict_policy({
                    'id': override.get('slug') or name,
                    'slug': override.get('slug') or name,
                    'name': name,
                    'priority': override.get('priority') or 'P2',
                    'website': website,
                    'grad_website': override.get('grad_website') or website,
                    'entry_points': override.get('entry_points') or [],
                    'strict_entry_points': bool(override.get('strict_entry_points')),
                }))
                seen_names.add(name)

            return universities
        except Exception as exc:
            self.logger.error(f'加载后端院校列表失败: {exc}')
            return []

    def build_fallback_universities(self):
        """后端映射失败时回退到本地覆盖配置，仅用于调试抓取。"""
        return [
            self.apply_default_strict_policy({
                'id': item['slug'],
                'slug': item['slug'],
                'name': item['name'],
                'priority': item['priority'],
                'website': item['website'],
                'grad_website': item['grad_website'],
                'entry_points': item['entry_points'],
                'strict_entry_points': bool(item.get('strict_entry_points')),
            })
            for item in self.crawl_overrides
        ]
    
    def build_urls(self, university):
        """构建爬取URL列表"""
        urls = []

        for entry_point in university.get('entry_points') or []:
            urls.append({
                'url': entry_point,
                'type': 'entry_point',
            })

        if university.get('strict_entry_points'):
            candidate_bases = []
        else:
            candidate_bases = self.derive_candidate_base_urls(university)

        explicit_grad_paths = [
            '/',
            '/zsxx/',
            '/sszs/',
            '/admission/',
            '/info/',
            '/yjszs/',
            '/yjsy/',
            '/graduate/',
            '/grs/',
            '/yz/',
            '/yzb/',
            '/zhaosheng/',
            '/zsgz/',
        ]
        root_only_paths = ['/']

        for candidate in candidate_bases:
            base_url = candidate['url']
            base_kind = candidate['kind']
            paths = explicit_grad_paths if base_kind == 'explicit_grad' else root_only_paths
            for path in paths:
                urls.append({
                    'url': urljoin(base_url, path),
                    'type': f'fallback_{base_kind}',
                })

        deduped = []
        seen = set()
        for item in urls:
            url = item['url']
            if url in seen:
                continue
            seen.add(url)
            deduped.append(item)
        return deduped

    def get_registrable_host(self, hostname):
        host = (hostname or '').lower().strip('.')
        if not host:
            return ''
        parts = host.split('.')
        if len(parts) <= 2:
            return host
        multi_level_suffixes = (
            'edu.cn',
            'ac.cn',
            'gov.cn',
            'org.cn',
            'com.cn',
            'net.cn',
        )
        suffix = '.'.join(parts[-2:])
        if suffix in multi_level_suffixes and len(parts) >= 3:
            return '.'.join(parts[-3:])
        return '.'.join(parts[-2:])

    def derive_candidate_base_urls(self, university):
        candidates = []
        grad_website = (university.get('grad_website') or '').strip()
        website = (university.get('website') or '').strip()

        normalized_grad = grad_website.rstrip('/') + '/' if grad_website else ''
        normalized_website = website.rstrip('/') + '/' if website else ''

        if normalized_grad and normalized_grad != normalized_website:
            candidates.append({
                'url': normalized_grad,
                'kind': 'explicit_grad',
            })

        if normalized_website:
            candidates.append({
                'url': normalized_website,
                'kind': 'website',
            })

        website_host = urlparse(website).hostname or ''
        root_host = self.get_registrable_host(website_host)
        grad_host = urlparse(grad_website).hostname or ''
        has_explicit_grad_host = bool(grad_host and self.get_host_key(grad_website) != self.get_host_key(website))

        if root_host and not has_explicit_grad_host:
            prefixes = ['yzb', 'yz', 'grs', 'gs', 'yjsy', 'graduate', 'admission']
            for prefix in prefixes:
                candidates.append({
                    'url': f'https://{prefix}.{root_host}/',
                    'kind': 'derived_prefix',
                })

        deduped = []
        seen = set()
        for item in candidates:
            url = item['url']
            if not url or url in seen:
                continue
            seen.add(url)
            deduped.append(item)
        return deduped
    
    def parse_list(self, response):
        """解析列表页"""
        university = response.meta['university']
        depth = response.meta.get('depth', 0)
        school = self.get_school_summary(university)
        school['listPagesVisited'] += 1
        school['listHosts'][self.get_host_key(response.url)] = (
            school['listHosts'].get(self.get_host_key(response.url), 0) + 1
        )
        self.flush_batch_summary()
        
        self.logger.info(f"解析列表页: {response.url} - {university['name']}")

        if self.should_skip_list_response(response.url):
            self.record_detail_drop(
                school,
                response.url,
                'blocked_list_redirect_host',
                response.url,
            )
            return

        if self.is_direct_detail_entry(response):
            school['detailCandidates'] += 1
            yield from self.parse_detail(response)
            return
        
        # 提取招生公告链接（夏令营/预推免）
        camp_links = self.extract_camp_links(response)
        school['detailCandidates'] += len(camp_links)
        
        for link in camp_links:
            yield scrapy.Request(
                url=link['url'],
                callback=self.parse_detail,
                errback=self.handle_error,
                meta={
                    'university': university,
                    'title': link['title'],
                    'announcement_type': link.get('announcement_type'),
                    'stage': 'detail',
                },
            )

        if depth < 2:
            for next_list in self.extract_followup_list_links(response):
                yield scrapy.Request(
                    url=next_list['url'],
                    callback=self.parse_list,
                    errback=self.handle_error,
                    meta={
                        'university': university,
                        'depth': depth + 1,
                        'stage': 'list',
                    },
                )
        
        # 处理分页
        if depth < 3:  # 最多爬取3页
            next_page = self.extract_next_page(response)
            if next_page:
                yield scrapy.Request(
                    url=next_page,
                    callback=self.parse_list,
                    errback=self.handle_error,
                    meta={
                        'university': university,
                        'depth': depth + 1,
                        'stage': 'list',
                    },
                )
    
    def extract_camp_links(self, response):
        """提取招生公告链接"""
        links = []

        selectors = [
            '//a[contains(@href, "camp") or contains(@title, "夏令营")]',
            '//a[contains(text(), "夏令营")]',
            '//a[contains(text(), "暑期学校")]',
            '//a[contains(text(), "预推免")]',
            '//a[contains(text(), "推免")]',
            '//a[contains(@href, "tuimian")]',
            '//a[contains(@href, "recommend")]',
            '//a[contains(@href, "xly")]',
            '//a[contains(@href, "tm")]',
            '//a[contains(@href, "sszs")]',
        ]
        selectors.extend(self.get_site_specific_link_selectors(response.url))

        for selector in selectors:
            nodes = response.xpath(selector)
            for node in nodes:
                href = node.xpath('./@href').get()
                if not href:
                    href = self.extract_onclick_url(node.xpath('./@onclick').get(), response.url)
                if not href:
                    continue
                title = self.normalize_text(' '.join(node.xpath('.//text()').getall()))
                title_attr = node.xpath('./@title').get()
                if title_attr:
                    title = self.normalize_text(f"{title} {title_attr}")
                url = urljoin(response.url, href)
                text_for_match = self.normalize_text(f'{title} {url}')
                if (
                    self.is_valid_url(url)
                    and self.should_follow_detail_candidate(response, url, title, text_for_match)
                ):
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

    def has_recruitment_context(self, response):
        merged = self.normalize_text(
            ' '.join([
                response.url,
                self.extract_page_title(response) or '',
            ])
        )
        if self.contains_positive_signal(merged):
            return True
        lowered = merged.lower()
        return any(keyword in lowered for keyword in self.list_navigation_url_keywords)

    def is_generic_detail_like_url(self, url):
        normalized = (url or '').lower()
        return any(keyword in normalized for keyword in self.generic_detail_url_keywords)

    def should_follow_detail_candidate(self, response, url, title, text_for_match):
        if not self.passes_detail_precheck(url):
            return False
        university = response.meta.get('university') if hasattr(response, 'meta') else None
        if not self.is_allowed_strict_target(university, url):
            return False
        merged_text = self.normalize_text(f'{title or ""} {url}')
        if self.contains_negative_signal(merged_text):
            return False
        if self.contains_positive_signal(merged_text):
            return True
        if self.is_target_year_text(text_for_match):
            return True
        if self.is_site_detail_allowlisted(url, self.clean_title(title or '')):
            return True
        if self.has_recruitment_context(response) and self.is_generic_detail_like_url(url):
            return True
        return False

    def is_same_registrable_site(self, left_url, right_url):
        left_host = self.get_registrable_host(urlparse(left_url).hostname or '')
        right_host = self.get_registrable_host(urlparse(right_url).hostname or '')
        return bool(left_host and left_host == right_host)

    def get_strict_allowed_hosts(self, university):
        if not isinstance(university, dict) or not university.get('strict_entry_points'):
            return set()

        allowed_hosts = set()
        for entry_point in (university.get('entry_points') or []):
            host = self.get_host_key(entry_point)
            if host:
                allowed_hosts.add(host)

        grad_host = self.get_host_key(university.get('grad_website') or '')
        if grad_host:
            allowed_hosts.add(grad_host)

        website_host = self.get_host_key(university.get('website') or '')
        if website_host and not allowed_hosts:
            allowed_hosts.add(website_host)

        if allowed_hosts == {website_host} and website_host:
            for candidate in self.derive_candidate_base_urls(university):
                host = self.get_host_key(candidate.get('url') or '')
                if host:
                    allowed_hosts.add(host)

        return allowed_hosts

    def is_allowed_strict_target(self, university, target_url):
        if not isinstance(university, dict) or not university.get('strict_entry_points'):
            return True

        target_host = self.get_host_key(target_url)
        if not target_host:
            return False

        allowed_hosts = self.get_strict_allowed_hosts(university)
        if target_host in allowed_hosts:
            return True
        if self.has_candidate_allowlist(target_url) and self.is_candidate_allowlisted(target_url):
            return True
        if self.is_direct_detail_pattern(target_url):
            return True
        return False

    def should_follow_list_navigation(self, current_url, target_url, title, university=None):
        if not self.is_valid_url(target_url):
            return False
        if self.is_system_page_url(target_url):
            return False
        if self.is_blocked_detail_host(target_url):
            return False
        if self.is_blocked_candidate_link(target_url):
            return False
        if not self.is_same_registrable_site(current_url, target_url):
            return False
        if not self.is_allowed_strict_target(university, target_url):
            return False

        merged = self.normalize_text(f'{title or ""} {target_url}').lower()
        if not merged:
            return False
        if any(keyword.lower() in merged for keyword in self.list_navigation_keywords):
            return True
        return any(keyword in merged for keyword in self.list_navigation_url_keywords)

    def extract_followup_list_links(self, response):
        links = []
        university = response.meta.get('university') if hasattr(response, 'meta') else None
        for node in response.xpath('//a[@href or @onclick]'):
            href = node.xpath('./@href').get()
            if not href:
                href = self.extract_onclick_url(node.xpath('./@onclick').get(), response.url)
            if not href:
                continue
            url = urljoin(response.url, href)
            title = self.normalize_text(' '.join(node.xpath('.//text()').getall()))
            title_attr = node.xpath('./@title').get()
            if title_attr:
                title = self.normalize_text(f'{title} {title_attr}')
            if not self.should_follow_list_navigation(response.url, url, title, university):
                continue
            if self.should_follow_detail(url, title, ''):
                continue
            links.append({'url': url, 'title': title})

        deduped = []
        seen = set()
        for item in links:
            url = item['url']
            if url in seen or url == response.url:
                continue
            seen.add(url)
            deduped.append(item)
        return deduped[:8]

    def extract_onclick_url(self, onclick, base_url):
        normalized = self.normalize_text(onclick)
        if not normalized:
            return None
        match = re.search(r"window\.open\(\s*['\"]([^'\"]+)['\"]", normalized, re.IGNORECASE)
        if match:
            return urljoin(base_url, match.group(1))
        match = re.search(r"location(?:\.href)?\s*=\s*['\"]([^'\"]+)['\"]", normalized, re.IGNORECASE)
        if match:
            return urljoin(base_url, match.group(1))
        return None
    
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
            if next_url and self.is_valid_url(urljoin(response.url, next_url)):
                return urljoin(response.url, next_url)
        
        return None
    
    def parse_detail(self, response):
        """解析详情页"""
        university = response.meta['university']
        link_title = response.meta.get('title', '').strip()
        meta_type = response.meta.get('announcement_type')
        school = self.get_school_summary(university)
        school['detailPagesVisited'] += 1
        school['detailHosts'][self.get_host_key(response.url)] = (
            school['detailHosts'].get(self.get_host_key(response.url), 0) + 1
        )
        
        self.logger.info(f"解析详情页: {response.url} - {university['name']}")

        if self.is_blocked_detail_host(response.url):
            self.record_detail_drop(
                school,
                response.url,
                'blocked_redirect_host',
                link_title or response.url,
            )
            return
        
        page_title = self.extract_page_title(response)
        content = self.extract_content(response)
        direct_detail_fallback = self.get_direct_detail_fallback(response.url)
        if direct_detail_fallback and (not page_title or len(content) < 40):
            page_title = page_title or direct_detail_fallback.get('title', '')
            if not content:
                content = '\n'.join(direct_detail_fallback.get('contentHints') or [])
        if self.is_access_forbidden_page(page_title, content, response.url):
            self.record_detail_drop(
                school,
                response.url,
                'access_forbidden',
                page_title or link_title or response.url,
            )
            return
        camp_info = self.extract_with_ai(response, page_title, content, university)
        if direct_detail_fallback:
            camp_info['title'] = camp_info.get('title') or direct_detail_fallback.get('title')
            camp_info['publish_date'] = camp_info.get('publish_date') or direct_detail_fallback.get('publishDate')
            camp_info['announcement_type'] = (
                camp_info.get('announcement_type')
                or direct_detail_fallback.get('announcementType')
            )
        
        if camp_info and self.is_within_target_year(camp_info, content, response):
            page_title_clean = self.clean_title(page_title)
            camp_title_clean = self.clean_title(camp_info.get('title', '').strip())
            link_title_clean = self.clean_title(link_title)
            raw_title_clean = self.clean_title(response.xpath('//title/text()').get(default='').strip())
            preferred_page_title = page_title_clean
            if (
                not preferred_page_title
                or preferred_page_title in self.weak_titles
                or preferred_page_title in {'研究生院 招生专题', '研究生招生专题', '研究生招生网', '研究生院'}
            ):
                preferred_page_title = ''
            title = self.clean_title(
                preferred_page_title
                or link_title_clean
                or camp_title_clean
                or raw_title_clean
            )
            keep, drop_reason = self.should_keep_detail(response.url, title, content)
            if not keep:
                self.record_detail_drop(school, response.url, drop_reason, title)
                return
            announcement_type = camp_info.get('announcement_type') or meta_type or self.detect_announcement_type(title, response.url, content)
            if not announcement_type:
                self.record_detail_drop(school, response.url, 'announcement_type_none', title)
                return
            item = CampInfoItem()
            item['title'] = title
            item['announcement_type'] = announcement_type
            item['sub_type'] = camp_info.get('sub_type') or self.detect_sub_type(title, content, announcement_type)
            item['university_id'] = university['id']
            item['source_url'] = response.url
            item['publish_date'] = camp_info.get('publish_date')
            item['deadline'] = camp_info.get('deadline')
            item['start_date'] = camp_info.get('start_date')
            item['end_date'] = camp_info.get('end_date')
            item['location'] = camp_info.get('location')
            item['requirements'] = camp_info.get('requirements', {})
            item['materials'] = camp_info.get('materials', [])
            item['process'] = camp_info.get('process', [])
            item['contact'] = camp_info.get('contact', {})
            item['content'] = content
            item['crawl_time'] = datetime.utcnow().isoformat()
            item['spider_name'] = self.name
            school['itemsEmitted'] += 1
            self.flush_batch_summary()
            
            yield item
        else:
            reason = 'camp_info_empty'
            if camp_info and not self.is_within_target_year(camp_info, content, response):
                reason = 'year_out_of_range'
            self.record_detail_drop(school, response.url, reason, link_title or page_title)

    def is_target_year_text(self, text):
        """快速判断文本是否落在目标年份窗口"""
        normalized = (text or '').strip()
        if not normalized:
            return False

        lowered = normalized.lower()
        if any(marker in lowered for marker in ['tjms', 'xlygs', 'ytmgs']):
            return True

        if any(keyword in normalized for keyword in ['夏令营', '暑期夏令营', '暑期学校', '预推免', '推荐免试', '推免生']):
            for year in self.target_years:
                short_year = str(year)[-2:]
                if any(pattern in normalized for pattern in [str(year), f'{short_year}年', f'{year}级', f'{year}届']):
                    return True

        for year in self.target_years:
            short_year = str(year)[-2:]
            explicit_patterns = [
                str(year),
                f'{short_year}年',
                f'{short_year}级',
                f'{short_year}届',
                f'{short_year}年度',
                f'{year}级',
                f'{year}届',
                f'{year}年度',
                f'{year}学年',
            ]
            if any(pattern in normalized for pattern in explicit_patterns):
                return True

        # 未识别年份但具备目标关键词时保留，详情页再做二次过滤
        keywords = ['夏令营', '暑期学校', '预推免', '推免', '推荐免试']
        return any(keyword in normalized for keyword in keywords)

    def detect_sub_type(self, title='', content='', announcement_type=None):
        """区分'框架文档'与'具体公告'：
        framework = 章程/接收办法/工作办法/实施细则 这类无统一截止日期的政策文件
        specific = 有具体报名时间/材料/流程的实际招生公告
        """
        title_norm = self.normalize_text(title or '')
        framework_patterns = [
            r'章程$', r'章程[\(（]', r'工作办法', r'接收.*办法', r'接收.*方案',
            r'实施细则', r'实施方案', r'管理办法', r'接收.*通知$',
        ]
        if any(re.search(p, title_norm) for p in framework_patterns):
            return 'framework'
        # Also check content for clear framework indicators
        content_head = self.normalize_text(content or '')[:400]
        if announcement_type == 'pre_recommendation' and (
            '制定本章程' in content_head or '制定本办法' in content_head or '制定本细则' in content_head
        ):
            return 'framework'
        return 'specific'

    def detect_announcement_type(self, title='', url='', content=''):
        """识别公告类型：summer_camp/pre_recommendation"""
        merged_text = self.normalize_text(' '.join([title or '', url or '', content[:500] if content else '']))

        if self.contains_negative_signal(merged_text):
            return None

        pre_patterns = [
            r'预推免',
            r'推免生',
            r'推荐免试',
            r'推免(?!夏令营)',
            r'免试攻读研究生',
            r'免试攻读',
            r'直博',
            r'预报名',
            r'tuimian',
            r'/tm',
            r'免试研究生',
        ]
        for pattern in pre_patterns:
            if re.search(pattern, merged_text, re.IGNORECASE):
                return 'pre_recommendation'

        summer_patterns = [
            r'夏令营',
            r'暑期学校',
            r'优秀大学生',
            r'xly',
            r'summer',
        ]
        for pattern in summer_patterns:
            if re.search(pattern, merged_text, re.IGNORECASE):
                return 'summer_camp'

        return None

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
            response.meta.get('title', '') if hasattr(response, 'meta') else '',
            response.url,
            content or '',
        ])
        return self.is_target_year_text(merged_text)
    
    def extract_content(self, response):
        """提取页面正文内容，避免将整页脚本/导航文本混入正文"""
        response.selector.remove_namespaces()

        content_selectors = [
            *self.get_site_specific_content_selectors(response.url),
            '//article',
            '//*[contains(@class, "content-detail")]',
            '//*[contains(@class, "article-content")]',
            '//*[contains(@class, "article-content")]',
            '//*[contains(@class, "wp_articlecontent")]',
            '//*[contains(@class, "gp-article")]',
            '//*[contains(concat(" ", normalize-space(@class), " "), " article ")]',
            '//*[contains(@class, "content")]',
            '//*[contains(@class, "detail")]',
            '//*[contains(@class, "news_content")]',
            '//*[contains(@class, "v_news_content")]',
            '//*[contains(@class, "entry")]',
            '//*[contains(@class, "read")]',
            '//*[@id="content"]',
            '//*[@id="vsb_content"]',
        ]

        for selector in content_selectors:
            nodes = response.xpath(selector)
            content = self.extract_text_from_nodes(nodes)
            if self.is_valid_content_block(content):
                return content

        return ''

    def get_site_specific_content_selectors(self, url):
        host = self.get_host_key(url)
        selectors = self.site_crawl_rules.get('contentSelectors', {})
        values = []
        for key, key_selectors in selectors.items():
            if host == key or host.endswith(f'.{key}'):
                values.extend(key_selectors or [])
        return values

    def extract_page_title(self, response):
        """优先从页面主标题节点提取标题，避免正文首句或脚本污染。"""
        for selector in self.get_site_specific_title_selectors(response.url):
            nodes = response.xpath(selector)
            for node in nodes:
                text_parts = node.xpath('.//text()').getall() if hasattr(node, 'xpath') else [str(node)]
                candidate = self.clean_title(' '.join(text_parts))
                if candidate and not self.is_noise_title(candidate):
                    return candidate

        node_selectors = [
            '//h1',
            '//h2',
            '//*[contains(@class, "article_title")]',
            '//*[contains(@class, "article-title")]',
            '//*[contains(@class, "title_header")]',
        ]
        value_selectors = [
            '//meta[@property="og:title"]/@content',
            '//title/text()',
        ]

        for selector in node_selectors:
            nodes = response.xpath(selector)
            for node in nodes:
                candidate = self.clean_title(' '.join(node.xpath('.//text()').getall()))
                if candidate and not self.is_noise_title(candidate):
                    return candidate

        for selector in value_selectors:
            texts = response.xpath(selector).getall()
            for text in texts:
                candidate = self.clean_title(text)
                if candidate and not self.is_noise_title(candidate):
                    return candidate

        generic_title_nodes = response.xpath('//*[contains(@class, "title") and not(self::title)]')
        for node in generic_title_nodes:
            candidate = self.clean_title(' '.join(node.xpath('.//text()').getall()))
            if candidate and not self.is_noise_title(candidate):
                return candidate
        return ''

    def extract_text_from_nodes(self, nodes):
        texts = []
        for node in nodes:
            block_nodes = node.xpath(
                './/*[self::p or self::li or self::tr or self::dd or self::blockquote or '
                'self::h2 or self::h3 or self::h4 or self::h5 or self::caption]'
                '[not(descendant::*[self::p or self::li or self::tr or self::dd or '
                'self::blockquote or self::h2 or self::h3 or self::h4 or self::h5 or '
                'self::caption])]'
            )
            if block_nodes:
                for block in block_nodes:
                    normalized = self.extract_clean_text_from_node(block)
                    if normalized:
                        texts.append(normalized)
            else:
                normalized = self.extract_clean_text_from_node(node)
                if normalized:
                    texts.append(normalized)
        cleaned_lines = self.clean_content_lines(texts)
        return '\n'.join(cleaned_lines).strip()

    def extract_clean_text_from_node(self, node):
        node_texts = node.xpath(
            './/text()['
            'not(ancestor::script) and '
            'not(ancestor::style) and '
            'not(ancestor::noscript) and '
            'not(ancestor::header) and '
            'not(ancestor::footer) and '
            'not(ancestor::nav) and '
            'not(ancestor::*[contains(@class, "breadcrumb")]) and '
            'not(ancestor::*[contains(@class, "share")]) and '
            'not(ancestor::*[contains(@class, "Author")]) and '
            'not(ancestor::*[contains(@class, "toolbar")]) and '
            'not(ancestor::*[contains(@class, "pagination")])'
            ']'
        ).getall()
        parts = []
        for text in node_texts:
            normalized = self.normalize_inline_text(text)
            if not normalized:
                continue
            if self.is_noise_inline_fragment(normalized):
                continue
            parts.append(normalized)
        return self.merge_inline_text_fragments(parts)

    def is_noise_inline_fragment(self, text):
        normalized = self.normalize_text(text)
        if not normalized:
            return True
        if self.contains_code_snippet(normalized):
            return True
        if re.fullmatch(r'[0-9０-９A-Za-z年月日号时分秒点:/：\-.()%（）]+', normalized):
            return False
        return bool(re.search(
            r'^(上一篇[:：]?.*|下一篇[:：]?.*|返回列表|分享到|扫一扫|打印|关闭窗口|信息来源[:：]?.*|发布日期[:：]?.*|发布时间[:：]?.*|浏览次数[:：]?.*|阅读次数[:：]?.*|访问量[:：]?.*|点击次数[:：]?.*|附件[:：]?)$',
            normalized,
        ))

    def normalize_inline_text(self, value):
        if value is None:
            return ''
        text = str(value).replace('\u00a0', ' ').replace('\r', ' ').replace('\n', ' ')
        return text.strip()

    def merge_inline_text_fragments(self, parts):
        fragments = [part for part in (parts or []) if part]
        if not fragments:
            return ''

        merged = fragments[0]
        for part in fragments[1:]:
            prev = merged[-1] if merged else ''
            curr = part[0] if part else ''
            if self.should_insert_space_between_fragments(prev, curr, merged, part):
                merged = f'{merged} {part}'
            else:
                merged = f'{merged}{part}'
        return self.normalize_text(merged)

    def should_insert_space_between_fragments(self, prev_char, curr_char, prev_text='', curr_text=''):
        if not prev_char or not curr_char:
            return False
        if re.match(r'[（(《“"【]', curr_char):
            return False
        if re.match(r'[）)》”"】、，。；：:！？!?]', curr_char):
            return False
        if re.match(r'[（(《“"【、，。；：:！？!?/\\-]', prev_char):
            return False
        if re.match(r'[\u4e00-\u9fff0-9年月日号时分秒点%-]', prev_char) and re.match(r'[\u4e00-\u9fff0-9年月日号时分秒点%-]', curr_char):
            return False
        if re.match(r'[A-Za-z@._]', prev_char) and re.match(r'[A-Za-z0-9@._/-]', curr_char):
            return False
        if re.match(r'[A-Za-z]', prev_char) and re.match(r'[\u4e00-\u9fff]', curr_char):
            return False
        if re.match(r'[\u4e00-\u9fff]', prev_char) and re.match(r'[A-Za-z]', curr_char):
            return False
        if prev_text.endswith('http') or prev_text.endswith('https'):
            return False
        return True

    def clean_content_lines(self, lines):
        source = [self.normalize_text(line) for line in (lines or []) if self.normalize_text(line)]
        if not source:
            return []

        merged = []
        for line in source:
            line = self.sanitize_content_line(self.compact_fragmented_content_line(line))
            if self.is_noise_content_line(line):
                continue
            if not merged:
                merged.append(line)
                continue
            prev = merged[-1]
            if self.should_merge_content_lines(prev, line):
                merged[-1] = self.normalize_text(f'{prev}{line}')
            elif prev != line:
                merged.append(line)

        cleaned = []
        seen = set()
        for line in merged:
            key = self.normalize_content_line_key(line)
            if not key:
                continue
            if cleaned and cleaned[-1] == line:
                continue
            if key in seen and len(key) > 4:
                continue
            seen.add(key)
            cleaned.append(line)
        return self.trim_semantic_repeated_blocks(cleaned)

    def sanitize_content_line(self, line):
        normalized = self.normalize_text(line)
        if not normalized:
            return ''
        normalized = re.sub(r'^(?:.+?(?:研究生招生信息网|招生信息网|研究生院官网|研究生院|研招网)(?:（[^）]*）|\([^)]*\))?)\s*', '', normalized)
        normalized = re.sub(r'(^|\s)(?:作者|作\s*者)[:：]\s*[^ ]+', ' ', normalized)
        normalized = re.sub(r'(^|\s)(?:来源|信息来源)[:：]\s*[^ ]+', ' ', normalized)
        normalized = re.sub(r'(^|\s)(?<![\u4e00-\u9fa5])时间[:：]\s*[^ ]+', ' ', normalized)
        normalized = re.sub(r'\s{2,}', ' ', normalized).strip(' ：:')
        return normalized

    def compact_fragmented_content_line(self, line):
        normalized = self.normalize_text(line)
        if not normalized:
            return ''
        normalized = re.sub(r'(?<=\d)\s+(?=\d)', '', normalized)
        normalized = re.sub(r'(?<=\d)\s+(?=[年月日号时分秒点月/\-.])', '', normalized)
        normalized = re.sub(r'(?<=[A-Za-z])\s+(?=[A-Za-z0-9@._/-])', '', normalized)
        normalized = re.sub(r'(?<=CET-\d)\s+(?=[≥<=])', '', normalized)
        return normalized

    def should_merge_content_lines(self, prev, current):
        if not prev or not current:
            return False
        if re.fullmatch(r'\d{1,4}', current):
            return True
        if re.search(r'\d$', prev) and re.match(r'^[年月日号时分秒./\-]', current):
            return True
        if len(prev) <= 4 or len(current) <= 2:
            return True
        if re.search(r'[:：]$', prev):
            return True
        return False

    def normalize_content_line_key(self, line):
        normalized = self.normalize_text(line)
        normalized = re.sub(r'\s+', '', normalized)
        normalized = re.sub(r'[，,。；;：:、（）()\[\]【】“”"\'‘’\-—·]', '', normalized)
        return normalized

    def trim_semantic_repeated_blocks(self, lines):
        normalized = [line for line in (lines or []) if line]
        if len(normalized) < 4:
            return normalized

        trimmed = []
        for line in normalized:
            if any(self.is_semantically_repeated_content_line(existing, line) for existing in trimmed):
                continue
            trimmed.append(line)

        if len(trimmed) < 6:
            return trimmed

        for window in range(min(4, len(trimmed) // 2), 1, -1):
            for start in range(0, len(trimmed) - window * 2 + 1):
                left = trimmed[start:start + window]
                right = trimmed[start + window:start + window * 2]
                if all(
                    self.is_semantically_repeated_content_line(left[idx], right[idx])
                    for idx in range(window)
                ):
                    return trimmed[:start + window]
        return trimmed

    def is_semantically_repeated_content_line(self, left, right):
        def normalize(value):
            text = self.normalize_text(value)
            text = re.sub(r'[0-9０-９]', '', text)
            text = re.sub(r'[（(][^）)]*[）)]', '', text)
            text = re.sub(r'[，,。；;：:、!！?？"“”\'‘’\-\—·\s]', '', text)
            return text.strip()

        a = normalize(left)
        b = normalize(right)
        if not a or not b:
            return False
        if a == b:
            return True
        if len(a) >= 6 and len(b) >= 6 and (a in b or b in a):
            return True
        shorter = a if len(a) <= len(b) else b
        longer = b if len(a) <= len(b) else a
        if len(shorter) < 6:
            return False
        return longer.startswith(shorter[: min(len(shorter), 10)])

    def is_valid_content_block(self, content):
        if not content or len(content) < 80:
            return False
        if self.contains_code_snippet(content):
            return False
        return self.contains_positive_signal(content) or any(
            keyword in content for keyword in ['报名', '材料', '申请条件', '联系方式']
        )

    def is_noise_content_line(self, text):
        normalized = self.normalize_text(text)
        if not normalized:
            return True
        if len(normalized) <= 1:
            return True
        if self.contains_code_snippet(normalized):
            return True
        return bool(re.search(
            r'^(上一篇[:：]?.*|下一篇[:：]?.*|返回列表|分享到|扫一扫|打印|关闭窗口|信息来源[:：]?.*|发布日期[:：]?.*|发布时间[:：]?.*|浏览次数[:：]?.*|阅读次数[:：]?.*|访问量[:：]?.*|点击次数[:：]?.*|附件[:：]?)$',
            normalized,
        ))

    def contains_code_snippet(self, text):
        normalized = self.normalize_text(text)
        if not normalized:
            return False
        return bool(re.search(
            r'(var\s+\w+\s*=|window\.location|document\.ready|navigator\.userAgent|<script|function\s*\(|\$\.\w+\()',
            normalized,
            re.IGNORECASE,
        ))

    def is_noise_title(self, title):
        normalized = self.normalize_text(title)
        if not normalized:
            return True
        if self.contains_code_snippet(normalized):
            return True
        if normalized in {'信息来源', '信息来源：'}:
            return True
        return normalized in self.weak_titles

    def is_access_forbidden_page(self, title='', content='', url=''):
        merged = self.normalize_text(' '.join([title or '', content or '', url or ''])).lower()
        if not merged:
            return False
        forbidden_markers = [
            'access forbidden',
            '资源或业务被限制访问',
            '访问被限制',
            '访问被拒绝',
        ]
        return any(marker.lower() in merged for marker in forbidden_markers)

    def normalize_text(self, value):
        normalized = re.sub(r'\s+', ' ', str(value or ''))
        return normalized.strip()

    def clean_title(self, value):
        title = self.normalize_text(value)
        if not title:
            return ''

        title = re.sub(r"^var\s+title\s*=\s*['\"]", '', title, flags=re.IGNORECASE)
        title = re.sub(r"['\"]\s*;?\s*//.*$", '', title)
        title = re.sub(r'\s*//\s*分享标题.*$', '', title)
        title = re.sub(r'\s+', ' ', title).strip(" '\";")
        noise_alternation = '|'.join(re.escape(label) for label in self.title_suffix_labels)
        title = re.sub(rf'(?:^|\s)(?:{noise_alternation})(?=\s|$)', ' ', title).strip()
        title = self.strip_repeated_labels(title, self.title_prefix_labels, from_start=True)
        title = self.strip_repeated_labels(title, self.title_suffix_labels, from_start=False)
        title = re.sub(r'\s*[-|｜_]\s*北京大学[^ ]+$', '', title).strip()
        title = re.sub(r'\s*(?:发布时间|发布日期)[:：]\s*\d{4}[./\-年]\d{1,2}[./\-月]\d{1,2}日?.*$', '', title).strip()
        title = re.sub(r'\s*点击数[:：]?\s*\d+.*$', '', title).strip()
        title = re.sub(r'发布日期[:：]?\s*\d{4}[./\-年]\d{1,2}[./\-月]\d{1,2}日?.*$', '', title)
        title = re.sub(r'^(.{2,40}?)\s+\1(?=关于)', r'\1', title).strip()
        title = re.sub(r'^(?:当前您的位置|您当前的位置|当前位置)[:：]?\s*', '', title).strip()
        generic_breadcrumb_pattern = r'^(?:首页|正文|通知公告|硕士招生公示|信息公开|招生信息|招生公告)$'
        weak_breadcrumb_pattern = r'^(?:首页|正文)$'
        breadcrumb_parts = [part.strip() for part in re.split(r'\s*>\s*', title) if part and part.strip()]
        if len(breadcrumb_parts) > 1:
            meaningful_parts = [part for part in breadcrumb_parts if not re.match(generic_breadcrumb_pattern, part)]
            fallback_parts = [part for part in breadcrumb_parts if not re.match(weak_breadcrumb_pattern, part)]
            title = (meaningful_parts[-1] if meaningful_parts else fallback_parts[-1] if fallback_parts else breadcrumb_parts[-1]).strip()
        title = re.sub(
            r'^.+?(?:信息公开|通知公告|招生信息|招生公告|研究生院|研究生招生信息网|研究生招生网站|研招网)\s+'
            r'(?=.{0,80}(?:夏令营|暑期学校|推免|预推免|推荐免试|免试攻读))',
            '',
            title,
        ).strip()
        title = re.sub(
            r'^(?:(?:信息公开|通知公告|招生信息|招生公告|研究生院|研究生招生信息网|研究生招生网站|研招网)\s+)+',
            '',
            title,
        ).strip()
        title = re.sub(weak_breadcrumb_pattern, '', title).strip()
        title = re.sub(r'\s*[-|｜_]\s*[^-|｜_]{0,60}(研究生招生网站|研招网|研究生院|招生信息网)$', '', title).strip()

        notice_match = re.search(
            r'((?:[^。；;]{0,80})?关于举办[^。；;]*(?:夏令营|暑期学校|推免|预推免|推荐免试)[^。；;]*(?:通知|公告)?)',
            title,
        )
        if notice_match:
            title = notice_match.group(1).strip()
        title = re.sub(r'((?:通知|公告))(?:\s+.*)?$', r'\1', title).strip()
        title = re.sub(r'发布日期[:：]?\s*\d{4}[./\-年]\d{1,2}[./\-月]\d{1,2}日?.*$', '', title).strip()

        # 去掉整句重复，例如“标题 标题”
        parts = title.split(' ')
        if len(parts) % 2 == 0:
            half = len(parts) // 2
            if parts[:half] == parts[half:]:
                title = ' '.join(parts[:half])

        return self.normalize_text(title)

    def is_system_like_title(self, title):
        normalized = self.clean_title(title).lower()
        if not normalized:
            return False
        system_keywords = [
            '报名系统',
            '管理服务系统',
            '信息管理系统',
            '申请系统',
            '申请平台',
            '报名平台',
            '登录系统',
            '登录平台',
            '管理平台',
            '服务平台',
            '网报系统',
        ]
        if any(keyword in normalized for keyword in system_keywords):
            return True
        if re.search(r'(?:夏令营|推免|预推免|推荐免试).{0,8}(?:系统|平台)$', normalized):
            return True
        if normalized.endswith('系统') or normalized.endswith('平台'):
            return True
        return False

    def strip_repeated_labels(self, value, labels, from_start=True):
        text = self.normalize_text(value)
        for label in labels:
            escaped = re.escape(label)
            if from_start:
                pattern = rf'^(?:{escaped}\s*)+'
            else:
                pattern = rf'(?:\s*{escaped})+$'
            text = re.sub(pattern, '', text).strip()
        return text

    def contains_negative_signal(self, text):
        normalized = self.normalize_text(text).lower()
        if not normalized:
            return False
        return any(keyword.lower() in normalized for keyword in self.negative_keywords)

    def contains_positive_signal(self, text):
        normalized = self.normalize_text(text).lower()
        if not normalized:
            return False
        return any(keyword.lower() in normalized for keyword in self.positive_keywords)

    def has_noisy_url(self, url):
        normalized = (url or '').lower()
        return any(keyword in normalized for keyword in self.noisy_url_keywords)

    def is_system_page_url(self, url):
        normalized = (url or '').strip().lower()
        if not normalized:
            return False
        return any(pattern in normalized for pattern in self.system_page_patterns)

    def passes_detail_precheck(self, url):
        normalized_url = (url or '').strip()
        if normalized_url in self.dead_detail_urls:
            return False
        if self.is_system_page_url(url):
            return False
        if self.is_blocked_detail_host(url):
            return False
        if self.is_blocked_candidate_link(url):
            return False
        if not self.is_candidate_allowlisted(url):
            return False
        if self.is_site_list_page(url):
            return False
        return True

    def should_follow_detail(self, url, title, content):
        if not self.passes_detail_precheck(url):
            return False
        if self.is_blocked_title_by_host(url, title):
            return False
        merged_text = self.normalize_text(' '.join([title or '', url or '', content[:200] if content else '']))
        if self.contains_negative_signal(merged_text):
            return False
        return self.contains_positive_signal(merged_text)

    def should_keep_detail(self, url, title, content):
        cleaned_title = self.clean_title(title)
        if not cleaned_title:
            return False, 'empty_title'
        if self.is_system_page_url(url):
            return False, 'system_page'
        if self.is_system_like_title(cleaned_title):
            return False, 'system_title'
        if self.is_blocked_title_by_host(url, cleaned_title):
            return False, 'blocked_title'
        if cleaned_title in self.weak_titles:
            return False, 'weak_title'
        if len(cleaned_title) < 6:
            return False, 'title_too_short'

        merged_text = self.normalize_text(' '.join([cleaned_title, url or '', content[:1500] if content else '']))
        if self.is_site_detail_allowlisted(url, cleaned_title):
            return True, None
        if self.contains_negative_signal(merged_text):
            return False, 'negative_signal'
        if self.has_noisy_url(url) and not self.contains_positive_signal(cleaned_title):
            return False, 'noisy_url_without_positive_title'
        if not self.contains_positive_signal(merged_text):
            return False, 'no_positive_signal'
        if len(self.normalize_text(content or '')) < 40:
            return False, 'content_too_short'
        if self._is_past_event_report(cleaned_title, content):
            return False, 'past_event_report'
        if self._is_index_page_content(content):
            return False, 'index_page_content'
        return True, None

    def _is_past_event_report(self, title, content):
        """Reject news reports about already-held events (e.g. '北理工举办了夏令营').
        Only fires when title has a past-event verb AND content lacks any registration language."""
        title_norm = self.normalize_text(title or '')
        if not re.search(r'举办|举行|圆满|顺利举办|已举办|成功举办', title_norm):
            return False
        content_norm = self.normalize_text(content or '')[:1000]
        registration_keywords = ['报名', '申请', '欢迎.*报名', '招募', '截止', '报名时间', '请于.*前']
        return not any(re.search(kw, content_norm) for kw in registration_keywords)

    def _is_index_page_content(self, content):
        """Reject pages whose extracted content is just a table of links or a dept-name list.
        Two signals: (a) high URL density, (b) 'notices to be published later' placeholder."""
        if not content:
            return False
        # Signal A: URL-heavy index table (e.g. ZJU summer-camp aggregator)
        url_count = len(re.findall(r'https?://', content))
        if url_count >= 4 and url_count * 60 > len(content):
            return True
        # Signal B: placeholder page saying notices will appear later (e.g. BUAA dept list)
        placeholder_patterns = [
            r'陆续.*公布.*请.*关注',
            r'通知.*陆续.*学院.*网站',
            r'请.*及时.*登录.*查看.*各学院',
        ]
        content_norm = self.normalize_text(content or '')
        return any(re.search(p, content_norm) for p in placeholder_patterns)

    def get_site_specific_link_selectors(self, url):
        host = self.get_host_key(url)
        selectors = self.site_crawl_rules.get('linkSelectors', {})
        return selectors.get(host, [])

    def get_site_specific_title_selectors(self, url):
        host = self.get_host_key(url)
        selectors = self.site_crawl_rules.get('titleSelectors', {})
        return selectors.get(host, [])

    def is_blocked_detail_host(self, url):
        host = self.get_host_key(url)
        blocked_hosts = {
            self.get_host_key(item)
            for item in (self.site_crawl_rules.get('blockedDetailHosts') or [])
            if item
        }
        return host in blocked_hosts

    def is_site_list_page(self, url):
        host = self.get_host_key(url)
        normalized_url = (url or '').lower()
        for item in self.site_crawl_rules.get('listPagePatterns', []):
            expected_host = item.get('host')
            path_fragment = (item.get('path') or '').lower()
            if host == expected_host and path_fragment and path_fragment in normalized_url:
                return True
        return False

    def is_site_detail_allowlisted(self, url, cleaned_title):
        host = self.get_host_key(url)
        normalized_url = (url or '').lower()
        normalized_title = self.normalize_text(cleaned_title).lower()
        for rule in self.site_crawl_rules.get('detailAllowRules', []):
            if host != rule.get('host'):
                continue
            if not any(keyword.lower() in normalized_url for keyword in (rule.get('pathKeywords') or [])):
                continue
            if any(keyword.lower() in normalized_title for keyword in (rule.get('titleKeywords') or [])):
                return True
        return False

    def is_direct_detail_entry(self, response):
        if response.meta.get('url_type') != 'entry_point':
            return False
        url = response.url
        title = self.extract_page_title(response)
        content = self.extract_content(response)
        if self.is_direct_detail_pattern(url):
            return True
        if self.is_system_page_url(url):
            return False
        if '/article/' in url and self.contains_positive_signal(' '.join([title or '', content[:500] if content else '', url])):
            return True
        if self.is_site_detail_allowlisted(url, self.clean_title(title or '')):
            return True
        if not self.is_site_list_page(url) and self.should_follow_detail(url, title, content):
            return True
        return False

    def is_blocked_candidate_link(self, url):
        host = self.get_host_key(url)
        patterns = (self.site_crawl_rules.get('blockedLinkPatterns') or {}).get(host, [])
        normalized_url = (url or '').lower()
        if any(pattern in normalized_url for pattern in self.generic_blocked_candidate_url_patterns):
            return True
        return any(str(pattern).lower() in normalized_url for pattern in patterns)

    def is_blocked_title_by_host(self, url, title):
        host = self.get_host_key(url)
        keywords = (self.site_crawl_rules.get('titleBlockKeywords') or {}).get(host, [])
        normalized_title = self.normalize_text(title).lower()
        if not normalized_title or not keywords:
            return False
        return any(str(keyword).lower() in normalized_title for keyword in keywords)

    def should_skip_list_response(self, url):
        normalized_url = (url or '').strip()
        if not normalized_url:
            return False
        if normalized_url in self.dead_detail_urls:
            return True
        if self.is_system_page_url(normalized_url):
            return True
        return self.is_blocked_detail_host(normalized_url)

    def is_candidate_allowlisted(self, url):
        host = self.get_host_key(url)
        patterns = (self.site_crawl_rules.get('candidateAllowPatterns') or {}).get(host, [])
        if not patterns:
            return True
        normalized_url = (url or '').lower()
        return any(str(pattern).lower() in normalized_url for pattern in patterns)

    def has_candidate_allowlist(self, url):
        host = self.get_host_key(url)
        patterns = (self.site_crawl_rules.get('candidateAllowPatterns') or {}).get(host, [])
        return bool(patterns)

    def is_direct_detail_pattern(self, url):
        host = self.get_host_key(url)
        patterns = (self.site_crawl_rules.get('directDetailPatterns') or {}).get(host, [])
        if not patterns:
            return False
        normalized_url = (url or '').lower()
        return any(str(pattern).lower() in normalized_url for pattern in patterns)

    def get_direct_detail_fallback(self, url):
        host = self.get_host_key(url)
        fallbacks = (self.site_crawl_rules.get('directDetailFallbacks') or {}).get(host, [])
        normalized_url = (url or '').lower()
        for item in fallbacks:
            pattern = str(item.get('pattern') or '').lower()
            if pattern and pattern in normalized_url:
                return item
        return None
    
    def extract_with_ai(self, response, page_title, content, university):
        """规则提取结构化信息，优先基于页面标题和正文分段。"""
        requirements_block = self.find_section_block(content, ['申请条件', '报名条件', '申请资格', '报名资格'])
        materials_block = self.find_section_block(content, ['申请材料', '报名材料', '提交材料', '材料提交'])
        process_block = self.find_section_block(content, ['申请流程', '报名流程', '选拔流程', '工作流程', '申请程序'])
        contact_block = self.find_section_block(content, ['联系方式', '联系人', '咨询电话', '联系电话', '联系邮箱', '通讯地址'])

        publish_date = self.extract_publish_date(content, response)
        publish_year = self.extract_year_from_iso(publish_date)

        deadline = None
        for deadline_block in [materials_block, process_block, content]:
            if deadline_block and not deadline:
                deadline_context = '\n'.join([page_title or '', deadline_block])
                deadline = self.extract_deadline(
                    deadline_context,
                    response.url,
                    university,
                    default_year=publish_year,
                )

        resolved_title = self.clean_title(page_title or self.extract_title(content))
        resolved_type = self.detect_announcement_type(page_title, response.url, content)
        camp_info = {
            'title': resolved_title,
            'announcement_type': resolved_type,
            'sub_type': self.detect_sub_type(resolved_title, content, resolved_type),
            'publish_date': publish_date,
            'deadline': deadline,
            'start_date': self.extract_event_date(
                content,
                ['活动时间', '举办时间', '开始时间', '营期时间'],
                pick='start',
                source_url=response.url,
                university=university,
                default_year=publish_year,
            ),
            'end_date': self.extract_event_date(
                content,
                ['活动时间', '举办时间', '结束时间', '营期时间'],
                pick='end',
                source_url=response.url,
                university=university,
                default_year=publish_year,
            ),
            'location': self.extract_location(content, response.url, university),
            'requirements': self.extract_requirements(requirements_block or content),
            'materials': self.extract_materials(materials_block or content),
            'process': self.extract_process(process_block or content),
            'contact': self.extract_contact(contact_block or content),
        }
        
        return camp_info
    
    def extract_title(self, content):
        """提取标题"""
        content = self.normalize_text(content)
        quoted = re.search(r"var\s+title\s*=\s*['\"]([^'\"]+)", content, re.IGNORECASE)
        if quoted:
            return self.clean_title(quoted.group(1))

        patterns = [
            r'[^。\n]*(?:夏令营|暑期学校)[^。\n]*',
            r'[^。\n]*(?:预推免|推免生|推荐免试|推免)[^。\n]*',
        ]
        for pattern in patterns:
            matches = re.findall(pattern, content)
            if matches:
                return self.clean_title(matches[0][:100])
        return ''
    
    def extract_publish_date(self, content, response):
        meta_candidates = [
            response.xpath('//meta[contains(@name, "publish")]/@content').get(),
            response.xpath('//meta[contains(@property, "article:published_time")]/@content').get(),
        ]
        for candidate in meta_candidates:
            normalized = self.parse_date_to_iso(candidate)
            if normalized:
                return normalized
        visible_meta = self.normalize_text(' '.join(response.xpath(
            '//*[contains(@class, "article-other") or contains(@class, "time") or contains(@class, "date")]//text()'
        ).getall()))
        return (
            self.extract_date_by_keywords(visible_meta, ['发布日期', '发布时间', '发布'])
            or self.extract_date_by_keywords(content, ['发布日期', '发布时间', '发布'])
        )

    def extract_deadline(self, content, source_url='', university=None, default_year=None):
        site_rule = self.get_site_specific_rule(source_url, university)
        labels = [
            '报名截止时间', '报名截止日期', '申请截止时间', '申请截止日期',
            '材料提交截止时间', '材料提交截止日期', '提交截止时间', '提交截止日期',
            '网上报名时间', '网报时间', '预报名时间', '预报名：', '预报名:', '报名时间', '申请时间',
            '截止时间', '截止日期', '报名截止', '申请截止', '截至', '截止',
        ]
        if site_rule:
            labels = site_rule.get('deadline_labels', []) + labels
        return (
            self.extract_date_by_keywords(content, labels, pick='last', default_year=default_year)
            or self.extract_deadline_before_marker(content, default_year=default_year)
        )

    def extract_event_date(self, content, labels, pick='start', source_url='', university=None, default_year=None):
        site_rule = self.get_site_specific_rule(source_url, university)
        if site_rule:
            labels = list(dict.fromkeys(list(site_rule.get('event_labels', [])) + list(labels)))
        dates = self.extract_event_dates_near_keywords(content, labels, default_year=default_year)
        if not dates:
            dates = self.extract_event_dates_from_action_sentences(content, default_year=default_year)
        if not dates:
            block = self.find_section_block(content, labels) or ''
            if block and not self.is_registration_date_context(block):
                dates = self.extract_all_dates(block)
        if not dates:
            return None
        return dates[0] if pick == 'start' else dates[-1]

    def extract_event_dates_near_keywords(self, content, labels, default_year=None):
        normalized_content = self.normalize_text(content)
        if not normalized_content:
            return []
        default_year = default_year or self.infer_default_date_year(normalized_content)
        dates = []
        for label in labels:
            pattern = rf'{re.escape(label)}[^。；;\n]{{0,160}}'
            for match in re.finditer(pattern, normalized_content):
                context = match.group(0)
                if self.is_registration_date_context(context):
                    continue
                dates.extend(self.extract_dates_from_text(context, default_year))
        deduped = []
        for value in dates:
            if value not in deduped:
                deduped.append(value)
        return deduped

    def extract_event_dates_from_action_sentences(self, content, default_year=None):
        normalized_content = self.normalize_text(content)
        if not normalized_content:
            return []
        default_year = default_year or self.infer_default_date_year(normalized_content)
        patterns = [
            r'(?:拟于|暂定于|计划于|定于)[^。；;\n]{0,120}?(?:举办|开展|举行|组织)[^。；;\n]{0,40}?(?:夏令营|暑期学校|活动|选拔)',
            r'(?:夏令营|暑期学校|活动|选拔)[^。；;\n]{0,80}?(?:拟于|暂定于|计划于|定于)[^。；;\n]{0,120}?(?:举办|开展|举行|组织)',
        ]
        dates = []
        for pattern in patterns:
            for match in re.finditer(pattern, normalized_content):
                context = match.group(0)
                if self.is_registration_date_context(context):
                    continue
                dates.extend(self.extract_dates_from_text(context, default_year))
        deduped = []
        for value in dates:
            if value not in deduped:
                deduped.append(value)
        return deduped

    def is_registration_date_context(self, text):
        normalized = self.normalize_text(text)
        return bool(re.search(r'(报名时间|申请时间|网上报名|网报|预报名|报名截止|申请截止|截止时间|截止日期)', normalized))

    def extract_deadline_before_marker(self, content, default_year=None):
        normalized_content = self.normalize_text(content)
        if not normalized_content:
            return None
        patterns = [
            r'(?:请于|须于|应于|务必于|需于|必须于)[^。；;\n]{0,100}?前',
            r'(?:报名|申请|提交|材料)[^。；;\n]{0,40}?(?:请于|须于|应于|务必于|需于|必须于)?[^。；;\n]{0,100}?前',
        ]
        dates = []
        for pattern in patterns:
            for match in re.finditer(pattern, normalized_content):
                dates.extend(self.extract_dates_from_text(match.group(0), default_year))
        return dates[-1] if dates else None

    def extract_location(self, content, source_url='', university=None):
        site_rule = self.get_site_specific_rule(source_url, university)
        labels = ['活动地点', '举办地点', '营期地点', '报到地点', '活动时间地点']
        if site_rule:
            labels = list(dict.fromkeys(labels + list(site_rule.get('location_labels', []))))
        block = (
            self.find_section_block(content, labels)
            or ''
        )
        candidates = self.split_list_items(block) if block else []

        if not candidates:
            inline_patterns = [
                r'(?:活动地点|举办地点|营期地点|报到地点)[：:]\s*([^\n；。]{4,120})',
                r'(?:活动时间地点|时间地点)[：:]\s*([^\n；。]{4,120})',
                r'(北大医学部[^\n；。]{0,80}(?:逸夫楼|药学楼|生化楼|教室|会议室|报告厅))',
                r'((?:药学楼|逸夫楼|生化楼|门诊楼|住院部)[^\n；。]{0,80}(?:教室|会议室|报告厅|办公室))',
                r'((?:海淀院区|昌平院区)[：:]\s*北京市[^\n；。]{4,120})',
                r'(北京市西城区西什库大街8号北京大学第一医院)',
            ]
            for pattern in inline_patterns:
                match = re.search(pattern, content)
                if match:
                    candidates.append(match.group(1))

        for candidate in candidates:
            location = self.clean_location(candidate)
            if location:
                return location

        if site_rule:
            normalized_content = self.normalize_text(content)
            fallback_keywords = site_rule.get('fallback_keywords', [])
            if (
                any(keyword in normalized_content for keyword in fallback_keywords)
                and '线上' not in normalized_content
            ):
                return site_rule.get('fallback_location')
        return None

    def extract_date_by_keywords(self, content, keywords, pick='first', default_year=None):
        dates = self.extract_dates_near_keywords(content, keywords, default_year=default_year)
        if dates:
            return dates[0] if pick == 'first' else dates[-1]
        for keyword in keywords:
            pattern = rf'{re.escape(keyword)}[：:\s]*([0-9]{{4}}[年/\-.][0-9]{{1,2}}[月/\-.][0-9]{{1,2}}日?(?:\s*[0-9]{{1,2}}[：:][0-9]{{2}})?)'
            match = re.search(pattern, content)
            if match:
                normalized = self.parse_date_to_iso(match.group(1))
                if normalized:
                    return normalized
        return None

    def extract_dates_near_keywords(self, content, keywords, default_year=None):
        normalized_content = self.normalize_text(content)
        if not normalized_content:
            return []
        default_year = default_year or self.infer_default_date_year(normalized_content)
        dates = []
        for keyword in keywords:
            pattern = rf'{re.escape(keyword)}[^。；;\n]{{0,120}}'
            for match in re.finditer(pattern, normalized_content):
                window = match.group(0)
                # Skip "截至/截止" false positives like "截至目前", "截至现在", "截止本科"
                if keyword in ('截至', '截止'):
                    after_kw = window[len(keyword):]
                    if re.match(r'^[：:\s]*(?:目前|现在|今日|今天|本(?:科|校|次|月|年)|上(?:学期|半年)|至今)', after_kw):
                        continue
                # Strip parenthetical exception clauses before date extraction
                # e.g. "9月1日—9月8日16:00（部分单位截止时间为9月3日16:00）" → use 9月8日, not 9月3日
                cleaned_window = re.sub(r'（[^（）]*）|\([^()]*\)', '', window)
                dates.extend(self.extract_dates_from_text(cleaned_window, default_year))
        deduped = []
        for value in dates:
            if value not in deduped:
                deduped.append(value)
        return deduped

    def extract_all_dates(self, content):
        values = self.extract_dates_from_text(content, self.infer_default_date_year(content))
        deduped = []
        for value in values:
            if value not in deduped:
                deduped.append(value)
        return deduped

    def extract_dates_from_text(self, content, default_year=None):
        values = []
        spans = []
        text = self.normalize_text(content)
        for match in re.finditer(r'([0-9]{4}[年/\-.][0-9]{1,2}[月/\-.][0-9]{1,2}日?(?:\s*(?:上午|下午|晚上|晚)?\s*[0-9]{1,2}[：:][0-9]{2})?)', text):
            spans.append(match.span())
            normalized = self.parse_date_to_iso(match.group(1))
            if normalized:
                values.append((match.start(), normalized))
        time_suffix = r'(?:\s*(?:上午|下午|晚上|晚)?\s*([0-9]{1,2}[：:][0-9]{2}))?'
        for match in re.finditer(r'([0-9]{4})\s*年\s*([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*[日号]?\s*(?:[—\-至到~～]+\s*)?([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*[日号]?' + time_suffix, text):
            start_text = f"{int(match.group(1)):04d}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"
            end_text = f"{int(match.group(1)):04d}-{int(match.group(4)):02d}-{int(match.group(5)):02d}"
            if match.group(6):
                end_text += f" {match.group(6)}"
            for date_text in [start_text, end_text]:
                normalized = self.parse_date_to_iso(date_text)
                if normalized:
                    values.append((match.start(), normalized))
            spans.append(match.span())
        for match in re.finditer(r'([0-9]{4})\s*年\s*([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*[日号]?\s*[—\-至到~～]+\s*([0-9]{1,2})\s*[日号]?(?!\s*月)' + time_suffix, text):
            start_text = f"{int(match.group(1)):04d}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"
            end_text = f"{int(match.group(1)):04d}-{int(match.group(2)):02d}-{int(match.group(4)):02d}"
            if match.group(5):
                end_text += f" {match.group(5)}"
            for date_text in [start_text, end_text]:
                normalized = self.parse_date_to_iso(date_text)
                if normalized:
                    values.append((match.start(), normalized))
            spans.append(match.span())
        for match in re.finditer(r'(?<![0-9])([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*[日号]?\s*[—\-至到~～]+\s*([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*[日号]?' + time_suffix, text):
            if not default_year:
                continue
            start_text = f"{default_year}-{int(match.group(1)):02d}-{int(match.group(2)):02d}"
            end_text = f"{default_year}-{int(match.group(3)):02d}-{int(match.group(4)):02d}"
            if match.group(5):
                end_text += f" {match.group(5)}"
            for date_text in [start_text, end_text]:
                normalized = self.parse_date_to_iso(date_text)
                if normalized:
                    values.append((match.start(), normalized))
            spans.append(match.span())
        for match in re.finditer(r'(?<![0-9])([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*[日号]?\s*[—\-至到~～]+\s*([0-9]{1,2})\s*[日号]?(?!\s*月)' + time_suffix, text):
            if not default_year:
                continue
            start_text = f"{default_year}-{int(match.group(1)):02d}-{int(match.group(2)):02d}"
            end_text = f"{default_year}-{int(match.group(1)):02d}-{int(match.group(3)):02d}"
            if match.group(4):
                end_text += f" {match.group(4)}"
            for date_text in [start_text, end_text]:
                normalized = self.parse_date_to_iso(date_text)
                if normalized:
                    values.append((match.start(), normalized))
            spans.append(match.span())
        for match in re.finditer(r'(?<![0-9])([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*日?(?:\s*(?:上午|下午|晚上|晚)?\s*([0-9]{1,2}[：:][0-9]{2}))?', text):
            if any(match.start() >= start and match.end() <= end for start, end in spans):
                continue
            if not default_year:
                continue
            date_text = f"{default_year}-{int(match.group(1)):02d}-{int(match.group(2)):02d}"
            if match.group(3):
                date_text += f" {match.group(3)}"
            normalized = self.parse_date_to_iso(date_text)
            if normalized:
                values.append((match.start(), normalized))
        return [value for _pos, value in sorted(values, key=lambda item: item[0])]

    def infer_default_date_year(self, content):
        normalized = self.normalize_text(content)
        years = re.findall(r'([0-9]{4})[年/\-.][0-9]{1,2}[月/\-.][0-9]{1,2}', normalized)
        if not years:
            class_years = [int(value) for value in re.findall(r'(20[0-9]{2})\s*届', normalized)]
            if class_years:
                return min(class_years) - 1
            return None
        counts = {}
        for year in years:
            counts[year] = counts.get(year, 0) + 1
        # Prefer years within target range when there is a tie or near-tie
        target = set(getattr(self, 'target_years', None) or [])
        if target:
            target_years_in_content = {y: c for y, c in counts.items() if int(y) in target}
            if target_years_in_content:
                # Among target years, prefer the one with highest count, then largest year
                best = sorted(target_years_in_content.items(), key=lambda item: (-item[1], -int(item[0])))[0]
                return int(best[0])
        return int(sorted(counts.items(), key=lambda item: (-item[1], -int(item[0])))[0][0])

    def extract_year_from_iso(self, value):
        if not value:
            return None
        match = re.match(r'(20[0-9]{2})-', str(value))
        return int(match.group(1)) if match else None


    def parse_date_to_iso(self, value):
        text = self.normalize_text(value)
        if not text:
            return None
        try:
            return datetime.fromisoformat(text).isoformat()
        except Exception:
            pass
        text = text.replace('年', '-').replace('月', '-').replace('日', '')
        text = text.replace('/', '-').replace('.', '-')
        text = text.replace('：', ':')
        text = re.sub(r'(上午|下午|晚上|晚)', ' ', text)
        text = re.sub(r'(\d{4}-\d{1,2}-\d{1,2})(\d{1,2}:\d{2})$', r'\1 \2', text)
        text = re.sub(r'\s+', ' ', text).strip()
        text = re.sub(r' 24:00$', ' 23:59', text)
        for fmt in ['%Y-%m-%d %H:%M', '%Y-%m-%d']:
            try:
                return datetime.strptime(text, fmt).isoformat()
            except Exception:
                continue
        return None

    def get_site_specific_rule(self, source_url, university=None):
        hostname = urlparse(source_url or '').hostname or ''
        hostname = hostname.lower()
        for rule in self.site_specific_rules:
            if any(hostname == host or hostname.endswith(f'.{host}') for host in rule.get('hosts', [])):
                return self.merge_site_rule(rule)

        website = ''
        if isinstance(university, dict):
            website = university.get('website') or ''
        website_host = urlparse(website).hostname or ''
        website_host = website_host.lower()
        if website_host and (hostname == website_host or hostname.endswith(f'.{website_host}')):
            return self.merge_site_rule({'hosts': [website_host]})

        return self.merge_site_rule(None)

    def merge_site_rule(self, rule):
        merged = dict(self.default_site_rule)
        if not rule:
            return merged
        for key, value in rule.items():
            if value is None:
                continue
            if isinstance(value, list):
                merged[key] = list(dict.fromkeys(list(merged.get(key, [])) + list(value)))
            else:
                merged[key] = value
        return merged
    
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
        items = self.split_list_items(content)
        material_keywords = [
            '申请表', '个人陈述', '成绩单', '获奖证书',
            '推荐信', '英语水平证明', '身份证复印件', '学生证',
        ]

        for item in items:
            for keyword in material_keywords:
                if keyword in item and keyword not in materials:
                    materials.append(keyword)
        return materials

    def extract_process(self, content):
        """提取报名流程"""
        process = []

        items = self.split_list_items(content)
        for item in items:
            if self.contains_code_snippet(item):
                continue
            if re.search(r'(报名|申请|提交|审核|通知|面试|复试|活动|公布|名单|录取)', item):
                cleaned = re.sub(r'^[0-9一二三四五六七八九十]+[.、）)]\s*', '', item).strip()
                if cleaned and cleaned not in process:
                    process.append(cleaned)
        return process

    def extract_contact(self, content):
        """提取联系方式（邮箱/电话/地址）"""
        contact = {}

        if self.contains_code_snippet(content):
            return contact

        email_match = re.search(r'([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', content)
        if email_match:
            contact['email'] = email_match.group(1)

        phone_candidates = re.findall(r'((?:0\d{2,3}-\d{7,8}(?:-\d+)?|1[3-9]\d{9}))', content)
        for candidate in phone_candidates:
            if self.is_valid_phone(candidate):
                contact['phone'] = candidate
                break

        address_match = re.search(
            r'((?:北京市|上海市|天津市|重庆市|[^\s，。；]{2,8}省[^\s，。；]{2,30}|[^\s，。；]{2,12}市[^\s，。；]{2,30})(?:区|县|镇|街道|路|号|楼|室|校区|学院|医院)[^\n；。]*)',
            content,
        )
        if address_match:
            address = self.normalize_text(address_match.group(1))
            if self.is_valid_address(address):
                contact['address'] = address

        return contact

    def clean_location(self, value):
        normalized = self.normalize_text(value)
        if not normalized or self.contains_code_snippet(normalized):
            return None
        normalized = re.sub(r'^(?:活动地点|举办地点|营期地点|报到地点|地点|地址)[：:]\s*', '', normalized)
        normalized = re.sub(r'^(?:线上|线下|腾讯会议|会议号)\s*[：:]\s*', '', normalized)
        normalized = normalized.strip('；;，,。 ')
        if len(normalized) < 4:
            return None
        if re.search(r'(报名|截止|发布时间|联系方式|邮箱|电话|推荐信|申请表)', normalized):
            return None
        if not re.search(r'(区|县|路|号|楼|室|校区|学院|医院|会议室|中心|线上|线下|腾讯会议|zoom|燕园|学院路)', normalized, re.IGNORECASE):
            return None
        return normalized

    def find_section_block(self, content, labels):
        normalized = content or ''
        for label in labels:
            pattern = rf'{re.escape(label)}[：:]?\s*(.+?)(?=(?:\n\s*[一二三四五六七八九十0-9]+[、.）)])|(?:\n\s*(?:申请条件|报名条件|申请资格|报名资格|申请材料|报名材料|提交材料|申请流程|报名流程|选拔流程|工作流程|联系方式|联系人|咨询电话|联系电话|联系邮箱|通讯地址)[：:])|$)'
            match = re.search(pattern, normalized, re.S)
            if match:
                block = self.normalize_text(match.group(1))
                if block and not self.contains_code_snippet(block):
                    return block
        return ''

    def split_list_items(self, content):
        if not content:
            return []
        segments = re.split(r'[\n；;]|(?:[0-9一二三四五六七八九十]+[.、）)])', content)
        items = []
        for segment in segments:
            normalized = self.normalize_text(segment)
            if not normalized:
                continue
            if len(normalized) < 2 or self.contains_code_snippet(normalized):
                continue
            items.append(normalized)
        return items

    def is_valid_phone(self, phone):
        normalized = self.normalize_text(phone)
        return bool(re.fullmatch(r'(?:0\d{2,3}-\d{7,8}(?:-\d+)?|1[3-9]\d{9})', normalized))

    def is_valid_address(self, address):
        normalized = self.normalize_text(address)
        if not normalized or len(normalized) < 8:
            return False
        if normalized in ['北京市', '上海市', '天津市', '重庆市']:
            return False
        return bool(re.search(r'(区|县|镇|街道|路|号|楼|室|校区|学院|医院)', normalized))
    
    def handle_error(self, failure):
        """处理请求错误"""
        request = getattr(failure, 'request', None)
        url = request.url if request else ''
        university = request.meta.get('university') if request and request.meta else None
        stage = request.meta.get('stage') if request and request.meta else 'unknown'
        host = self.get_host_key(url)
        school = self.get_school_summary(university) if university else None

        if school is not None:
            school['requestErrors'] += 1
            school['failedHosts'][host] = school['failedHosts'].get(host, 0) + 1
            school['errors'].append({
                'stage': stage,
                'url': url,
                'reason': 'request_error',
                'error': str(failure.value)[:300],
            })
            school['errors'] = school['errors'][-20:]
            self.flush_batch_summary()

        if host:
            failed = self.batch_summary['failedHosts']
            failed[host] = failed.get(host, 0) + 1

        self.logger.error(f"请求失败: {url}")
        self.logger.error(f"错误信息: {failure.value}")

    def get_host_key(self, url):
        return (urlparse(url or '').hostname or '').lower()

    def get_school_summary(self, university):
        key = ''
        if isinstance(university, dict):
            key = str(university.get('id') or university.get('name') or '').strip()
        if not key:
            key = 'unknown'
        schools = self.batch_summary['schools']
        if key not in schools:
            schools[key] = {
                'id': university.get('id') if isinstance(university, dict) else None,
                'name': university.get('name') if isinstance(university, dict) else 'unknown',
                'priority': university.get('priority') if isinstance(university, dict) else None,
                'website': university.get('website') if isinstance(university, dict) else None,
                'gradWebsite': university.get('grad_website') if isinstance(university, dict) else None,
                'plannedEntryCount': 0,
                'plannedEntryUrls': [],
                'listPagesVisited': 0,
                'detailCandidates': 0,
                'detailPagesVisited': 0,
                'detailsFiltered': 0,
                'itemsEmitted': 0,
                'requestErrors': 0,
                'listHosts': {},
                'detailHosts': {},
                'failedHosts': {},
                'dropReasons': {},
                'errors': [],
            }
        return schools[key]

    def record_detail_drop(self, school, url, reason, title=''):
        school['detailsFiltered'] += 1
        reason = reason or 'unknown'
        school['dropReasons'][reason] = school['dropReasons'].get(reason, 0) + 1
        school['errors'].append({
            'stage': 'detail',
            'url': url,
            'reason': reason,
            'title': self.clean_title(title)[:200] if title else '',
        })
        school['errors'] = school['errors'][-20:]

    def closed(self, reason):
        self.batch_summary['reason'] = reason
        self.flush_batch_summary(force=True, reason=reason)

        self.logger.info(f'[batch-summary] path={self.summary_path}')
        self.logger.info(
            '[batch-summary] '
            f"build={self.batch_summary['buildTag']} "
            f"schools={self.batch_summary['schoolCount']} "
            f"planned={self.batch_summary['totals']['plannedEntryCount']} "
            f"detail_candidates={self.batch_summary['totals']['detailCandidates']} "
            f"items={self.batch_summary['totals']['itemsEmitted']} "
            f"errors={self.batch_summary['totals']['requestErrors']}"
        )

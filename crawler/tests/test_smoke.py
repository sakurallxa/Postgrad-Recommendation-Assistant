from pathlib import Path
import sys
from types import SimpleNamespace
from scrapy.http import HtmlResponse, Request

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from baoyan_crawler.spiders.university_spider import UniversitySpider


def test_crawler_layout_smoke():
    """Basic smoke check to ensure crawler project layout is present."""
    assert (ROOT / "scrapy.cfg").exists()
    assert (ROOT / "baoyan_crawler" / "settings.py").exists()
    assert (ROOT / "baoyan_crawler" / "spiders").exists()


def test_parse_date_to_iso_accepts_iso_timestamp():
    spider = UniversitySpider(university_id="sysu", priority="P1")

    assert spider.parse_date_to_iso("2024-09-20T10:30:00+08:00") == "2024-09-20T10:30:00+08:00"


def test_target_year_text_matches_grade_and_cohort_markers():
    spider = UniversitySpider(university_id="sysu", priority="P1")

    assert spider.is_target_year_text("中山大学2026级推免生预报名通知")
    assert spider.is_target_year_text("面向26届本科生开展夏令营报名")


def test_is_within_target_year_scans_full_article_content():
    spider = UniversitySpider(university_id="sysu", priority="P1")
    response = SimpleNamespace(url="https://graduate.sysu.edu.cn/zsw/article/492")
    camp_info = {
        "title": "中山大学推免预报名通知",
        "publish_date": None,
        "deadline": None,
        "start_date": None,
        "end_date": None,
    }
    content = f"{'导语' * 260}本通知面向2026级推免生，报名即将开始。"

    assert spider.is_within_target_year(camp_info, content, response)


def test_blocked_list_response_rejects_tju_redirect_host():
    spider = UniversitySpider(university_id="tju", priority="P1")

    assert spider.should_skip_list_response("http://202.113.8.92/gstms/examineeIndex.action")


def test_access_forbidden_page_is_classified_separately():
    spider = UniversitySpider(university_id="sysu", priority="P1")

    assert spider.is_access_forbidden_page("资源或业务被限制访问 Access Forbidden", "", "https://graduate.sysu.edu.cn/zsw/article/492")


def test_sysu_direct_detail_fallback_is_available():
    spider = UniversitySpider(university_id="sysu", priority="P1")

    fallback = spider.get_direct_detail_fallback("https://graduate.sysu.edu.cn/zsw/article/492")

    assert fallback["title"] == "中山大学2026年接收推荐免试研究生办法"
    assert fallback["announcementType"] == "pre_recommendation"


def test_detail_allowlist_overrides_generic_negative_terms():
    spider = UniversitySpider(university_id="sysu", priority="P1")

    keep, reason = spider.should_keep_detail(
        "https://graduate.sysu.edu.cn/zsw/article/492",
        "中山大学2026年接收推荐免试研究生办法",
        "按照教育部有关工作要求，中山大学通过推荐免试方式接收全国优秀应届本科毕业生免试攻读博士、硕士学位研究生。",
    )

    assert keep is True
    assert reason is None


def test_build_urls_limits_fallback_fanout_without_explicit_grad_site():
    spider = UniversitySpider(university_id="sysu", priority="P1")

    urls = spider.build_urls(
        {
            "id": "nwpu",
            "slug": "nwpu",
            "name": "西北工业大学",
            "priority": "P1",
            "website": "https://www.nwpu.edu.cn",
            "grad_website": "https://www.nwpu.edu.cn",
            "entry_points": [],
            "strict_entry_points": False,
        }
    )

    values = [item["url"] for item in urls]

    assert "https://www.nwpu.edu.cn/" in values
    assert "https://yzb.nwpu.edu.cn/" in values
    assert "https://yzb.nwpu.edu.cn/sszs/" not in values
    assert "https://www.nwpu.edu.cn/zsxx/" not in values


def test_build_urls_keeps_deeper_paths_for_explicit_grad_site():
    spider = UniversitySpider(university_id="sysu", priority="P1")

    urls = spider.build_urls(
        {
            "id": "demo",
            "slug": "demo",
            "name": "示例大学",
            "priority": "P1",
            "website": "https://www.demo.edu.cn",
            "grad_website": "https://yz.demo.edu.cn",
            "entry_points": [],
            "strict_entry_points": False,
        }
    )

    values = [item["url"] for item in urls]

    assert "https://yz.demo.edu.cn/" in values
    assert "https://yz.demo.edu.cn/sszs/" in values
    assert "https://www.demo.edu.cn/zsxx/" not in values


def test_p2_defaults_to_strict_root_entry_when_no_override_exists():
    spider = UniversitySpider(university_id="demo", priority="P2")

    normalized = spider.apply_default_strict_policy(
        {
            "id": "demo-p2",
            "slug": "demo-p2",
            "name": "示例P2大学",
            "priority": "P2",
            "website": "https://www.demo.edu.cn",
            "grad_website": "https://www.demo.edu.cn",
            "entry_points": [],
            "strict_entry_points": False,
        }
    )

    assert normalized["strict_entry_points"] is True
    assert normalized["entry_points"] == ["https://www.demo.edu.cn/"]


def test_backend_university_load_merges_local_overrides_when_backend_is_sparse(monkeypatch):
    spider = UniversitySpider()

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "data": [
                    {
                        "id": "remote-tsinghua",
                        "name": "清华大学",
                        "priority": "P0",
                        "website": "https://www.tsinghua.edu.cn",
                    }
                ],
                "meta": {"totalPages": 1},
            }

    monkeypatch.setattr("baoyan_crawler.spiders.university_spider.requests.get", lambda *args, **kwargs: FakeResponse())

    universities = spider.fetch_universities_from_backend()
    names = {item["name"] for item in universities}

    assert "清华大学" in names
    assert "北京大学" in names
    assert "电子科技大学" in names
    assert next(item for item in universities if item["name"] == "清华大学")["id"] == "remote-tsinghua"


def test_uestc_detail_url_is_not_blocked_as_list_page():
    spider = UniversitySpider(university_id="uestc", priority="P1")

    assert spider.is_site_list_page("https://yz.uestc.edu.cn/zsxc1/xly.htm")
    assert not spider.is_site_list_page("https://yz.uestc.edu.cn/info/1064/5526.htm")
    assert spider.is_candidate_allowlisted("https://yz.uestc.edu.cn/info/1064/5526.htm")
    assert spider.is_candidate_allowlisted("https://yz.uestc.edu.cn/info/1007/5342.htm")
    assert not spider.is_candidate_allowlisted("https://yz.uestc.edu.cn/info/1004/5740.htm")


def test_extract_followup_list_links_discovers_grad_navigation():
    spider = UniversitySpider(university_id="demo", priority="P2")
    html = """
    <html><body>
      <a href="https://graduate.demo.edu.cn/zsxx/">研究生招生</a>
      <a href="https://graduate.demo.edu.cn/user/login">系统登录</a>
    </body></html>
    """
    response = HtmlResponse(
        url="https://www.demo.edu.cn/",
        body=html,
        encoding="utf-8",
        request=Request(
            url="https://www.demo.edu.cn/",
            meta={
                "university": {
                    "id": "demo-p2",
                    "slug": "demo-p2",
                    "name": "示例P2大学",
                    "priority": "P2",
                    "website": "https://www.demo.edu.cn",
                    "grad_website": "https://www.demo.edu.cn",
                    "entry_points": ["https://www.demo.edu.cn/"],
                    "strict_entry_points": True,
                }
            },
        ),
    )

    links = spider.extract_followup_list_links(response)

    assert links == [{"url": "https://graduate.demo.edu.cn/zsxx/", "title": "研究生招生"}]


def test_extract_followup_list_links_blocks_non_recruitment_hosts_for_strict_school():
    spider = UniversitySpider(university_id="demo", priority="P2")
    html = """
    <html><body>
      <a href="https://news.demo.edu.cn/info/1044/51443.htm">校园新闻</a>
      <a href="https://xkb.demo.edu.cn/info/1009/1227.htm">学科办通知</a>
    </body></html>
    """
    response = HtmlResponse(
        url="https://yjszs.demo.edu.cn/",
        body=html,
        encoding="utf-8",
        request=Request(
            url="https://yjszs.demo.edu.cn/",
            meta={
                "university": {
                    "id": "demo-strict",
                    "slug": "demo-strict",
                    "name": "示例严格大学",
                    "priority": "P2",
                    "website": "https://www.demo.edu.cn",
                    "grad_website": "https://yjszs.demo.edu.cn",
                    "entry_points": ["https://yjszs.demo.edu.cn/"],
                    "strict_entry_points": True,
                }
            },
        ),
    )

    links = spider.extract_followup_list_links(response)

    assert links == []


def test_extract_content_merges_fragmented_year_and_filters_meta_lines():
    spider = UniversitySpider(university_id="demo", priority="P1")
    html = """
    <html><body>
      <div class="content">
        <p>信息来源</p>
        <p>发布日期</p>
        <p>我校20</p>
        <p>26</p>
        <p>年推荐免试研究生录取工作已经结束，现将名单予以公示。</p>
        <p>申请条件及后续安排以学校研究生招生办公室通知为准。</p>
        <p>若对公示人员的拟录取资格有异议，请在公示期间实名向研究生招生办公室反映。</p>
        <p>上一篇</p>
        <p>下一篇</p>
      </div>
    </body></html>
    """
    response = HtmlResponse(
        url="https://example.edu.cn/info/1.htm",
        body=html,
        encoding="utf-8",
        request=Request(url="https://example.edu.cn/info/1.htm"),
    )

    content = spider.extract_content(response)

    assert "我校2026年推荐免试研究生录取工作已经结束" in content
    assert "信息来源" not in content
    assert "上一篇" not in content


def test_extract_content_dedupes_repeated_footer_blocks():
    spider = UniversitySpider(university_id="demo", priority="P1")
    html = """
    <html><body>
      <div class="article-content">
        <p>各位同学：</p>
        <p>学校决定举办夏令营活动。</p>
        <p>报名时间为2024年6月1日至6月12日，请登录系统提交申请材料。</p>
        <p>活动期间将组织学科讲座、师生交流和综合考核，具体安排以后续通知为准。</p>
        <p>研究生招生办公室</p>
        <p>2024年5月27日</p>
        <p>研究生招生办公室</p>
        <p>2024年5月27日</p>
      </div>
    </body></html>
    """
    response = HtmlResponse(
        url="https://example.edu.cn/info/2.htm",
        body=html,
        encoding="utf-8",
        request=Request(url="https://example.edu.cn/info/2.htm"),
    )

    content = spider.extract_content(response)

    assert content.count("研究生招生办公室") == 1
    assert content.count("2024年5月27日") == 1


def test_extract_content_filters_prev_next_and_compacts_fragmented_numbers():
    spider = UniversitySpider(university_id="demo", priority="P1")
    html = """
    <html><body>
      <div class="content">
        <p>同济大学2026年接收推荐免试研究生（含直接攻博）章程</p>
        <p>上一篇： 某篇通知</p>
        <p>下一篇： 另一篇通知</p>
        <p>我校20 26 年接收推荐免试研究生工作已经启动。</p>
        <p>公示时间：2025年10 21 日至10 27 日。</p>
        <p>报名材料和申请条件详见后续通知。</p>
      </div>
    </body></html>
    """
    response = HtmlResponse(
        url="https://example.edu.cn/info/3.htm",
        body=html,
        encoding="utf-8",
        request=Request(url="https://example.edu.cn/info/3.htm"),
    )

    content = spider.extract_content(response)

    assert "上一篇" not in content
    assert "下一篇" not in content
    assert "2026年接收推荐免试研究生工作已经启动" in content


def test_extract_content_strips_site_header_meta_and_repeated_blocks():
    spider = UniversitySpider(university_id="demo", priority="P1")
    html = """
    <html><body>
      <div class="content">
        <p>重庆大学研究生招生信息网（测试版）</p>
        <p>重庆大学2026年拟录取推免硕士（直博）研究生名单公示 作者：研究生院 时间：2025-12-24</p>
        <p>经我校各二级研究生招生单位复试考核，并完成国家推免服务系统相关拟录取手续，报学校研究生招生委员会审批后，拟录取下列考生为我校2026年推免硕士（直博）研究生（含强基转段学生），现将拟录取名单进行公示（见附件）。</p>
        <p>注：最终录取数据以教育部审批数据为准 公示时间：2025年12月25日8:30-12月31日8:30</p>
        <p>经我校各二级研究生招生单位复试考核，并完成国家推免服务系统相关拟录取手续，报学校研究生招生委员会审批后，拟录取下列考生为我校2026年推免硕士（直博）研究生（含强基转段学生），现将拟录取名单进行公示（见附件）。</p>
        <p>注：最终录取数据以教育部审批数据为准 公示时间：2025年12月25日8:30-12月31日8:30</p>
      </div>
    </body></html>
    """
    response = HtmlResponse(
        url="https://yz.cqu.edu.cn/info/2026/1.htm",
        body=html,
        encoding="utf-8",
        request=Request(url="https://yz.cqu.edu.cn/info/2026/1.htm"),
    )

    content = spider.extract_content(response)

    assert "研究生招生信息网（测试版）" not in content
    assert "作者：" not in content
    assert " 时间：" not in content
    assert "公示时间" in content
    assert content.count("拟录取名单进行公示") == 1


def test_extract_content_merges_inline_span_fragments_and_uses_h2_title():
    spider = UniversitySpider(university_id="demo", priority="P1")
    html = """
    <html><head><title>重庆大学研究生招生信息网（测试版）</title></head><body>
      <div class="content">
        <h2>重庆大学2026年拟录取推免硕士（直博）研究生名单公示</h2>
        <div class="Author"><span>作者：研究生院</span><span>时间：2025-12-24</span></div>
        <div class="content-main">
          <p>
            <span>拟录取下列考生为我校</span><span>202</span><span>6</span><span>年推免硕士（直博）研究生</span>
          </p>
          <p>
            <span>公示时间：</span><span>202</span><span>5</span><span>年</span><span>12</span><span>月</span><span>25</span><span>日8:30</span>
            <span>-</span><span>12</span><span>月</span><span>31</span><span>日8:30</span>
          </p>
        </div>
      </div>
    </body></html>
    """
    response = HtmlResponse(
        url="https://yz.cqu.edu.cn/news/2025-12/2418.html",
        body=html,
        encoding="utf-8",
        request=Request(url="https://yz.cqu.edu.cn/news/2025-12/2418.html"),
    )

    content = spider.extract_content(response)
    title = spider.extract_page_title(response)

    assert title == "重庆大学2026年拟录取推免硕士（直博）研究生名单公示"
    assert "研究生招生信息网（测试版）" not in content
    assert "作者：" not in content
    assert "作者：" not in content
    assert "研究生院" not in content
    assert "2026年推免硕士（直博）研究生" in content
    assert "公示时间：2025年12月25日8:30-12月31日8:30" in content


def test_clean_title_strips_shell_labels_and_system_titles_are_rejected():
    spider = UniversitySpider(university_id="demo", priority="P1")

    cleaned = spider.clean_title("中国农业大学研究生院 信息公开 中国农业大学各院系2026年接收推荐免试研究生工作实施细则")
    keep, reason = spider.should_keep_detail(
        "https://example.edu.cn/tm/system",
        "夏令营报名系统",
        "请登录系统完成报名。",
    )

    assert cleaned == "中国农业大学各院系2026年接收推荐免试研究生工作实施细则"
    assert keep is False
    assert reason == "system_title"


def test_extract_camp_links_allows_detail_links_from_recruitment_list_without_year():
    spider = UniversitySpider(university_id="demo", priority="P2")
    html = """
    <html><head><title>研究生招生</title></head><body>
      <a href="https://graduate.demo.edu.cn/info/1234/5678.htm">关于报名工作的通知</a>
    </body></html>
    """
    response = HtmlResponse(
        url="https://graduate.demo.edu.cn/zsxx/",
        body=html,
        encoding="utf-8",
        request=Request(
            url="https://graduate.demo.edu.cn/zsxx/",
            meta={
                "university": {
                    "id": "demo",
                    "slug": "demo",
                    "name": "示例大学",
                    "priority": "P2",
                    "website": "https://www.demo.edu.cn",
                    "grad_website": "https://graduate.demo.edu.cn",
                    "entry_points": ["https://graduate.demo.edu.cn/"],
                    "strict_entry_points": True,
                }
            },
        ),
    )

    links = spider.extract_camp_links(response)

    assert links == [
        {
            "url": "https://graduate.demo.edu.cn/info/1234/5678.htm",
            "title": "关于报名工作的通知",
            "announcement_type": None,
        }
    ]


def test_extract_camp_links_blocks_cross_host_detail_for_strict_school():
    spider = UniversitySpider(university_id="demo", priority="P2")
    html = """
    <html><head><title>研究生招生</title></head><body>
      <a href="https://news.demo.edu.cn/info/1044/51443.htm">关于报名工作的通知</a>
    </body></html>
    """
    response = HtmlResponse(
        url="https://yjszs.demo.edu.cn/zsxx/",
        body=html,
        encoding="utf-8",
        request=Request(
            url="https://yjszs.demo.edu.cn/zsxx/",
            meta={
                "university": {
                    "id": "demo-strict",
                    "slug": "demo-strict",
                    "name": "示例严格大学",
                    "priority": "P2",
                    "website": "https://www.demo.edu.cn",
                    "grad_website": "https://yjszs.demo.edu.cn",
                    "entry_points": ["https://yjszs.demo.edu.cn/"],
                    "strict_entry_points": True,
                }
            },
        ),
    )

    links = spider.extract_camp_links(response)

    assert links == []

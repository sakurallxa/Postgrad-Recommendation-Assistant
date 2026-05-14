import json
from pathlib import Path

import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.search_discovery_mvp import (  # noqa: E402
    SearchCandidate,
    UniversityTarget,
    build_queries,
    build_site_seed_urls,
    candidate_passes_prefilter,
    choose_response_encoding,
    choose_title,
    dedupe_candidates,
    discover_site_candidates,
    extract_attachment_links,
    extract_page_links,
    extract_item,
    has_candidate_negative_signal,
    has_target_discovery_signal,
    infer_announcement_type_from_search_hint,
    load_candidates_file,
    merge_ingest_summaries,
    resolve_search_provider,
    search_brave,
    search_serper,
    search_serpapi,
    write_candidates,
    targets_from_crawl_overrides,
    write_coverage_report,
)
from baoyan_crawler.spiders.university_spider import UniversitySpider  # noqa: E402
from scrapy.http import HtmlResponse, Request  # noqa: E402


def test_build_queries_includes_school_and_site_scoped_terms():
    target = UniversityTarget(
        id="thu",
        name="清华大学",
        priority="P0",
        website="https://www.tsinghua.edu.cn",
        grad_website="https://yz.tsinghua.edu.cn",
    )

    queries = build_queries(target, [2026])

    assert "清华大学 2026 夏令营 推免" in queries
    assert "清华大学 2026 推荐免试 预报名" in queries
    assert "site:yz.tsinghua.edu.cn 2026 夏令营" in queries
    assert "site:tsinghua.edu.cn 2026 推荐免试" in queries


def test_build_site_seed_urls_includes_configured_entry_points_and_common_sections():
    target = UniversityTarget(
        id="pku",
        name="北京大学",
        priority="P0",
        website="https://www.pku.edu.cn",
        grad_website="https://admission.pku.edu.cn",
        entry_points=["https://admission.pku.edu.cn/tzgg/index.htm"],
    )

    urls = build_site_seed_urls(target)

    assert "https://admission.pku.edu.cn/tzgg/index.htm" in urls
    assert "https://admission.pku.edu.cn/zsxx/index.htm" in urls
    assert "https://www.pku.edu.cn/yjszs/index.htm" in urls


def test_load_candidates_file_maps_names_to_backend_ids(tmp_path):
    target = UniversityTarget(
        id="backend-pku",
        name="北京大学",
        priority="P0",
        website="https://www.pku.edu.cn",
        grad_website="https://admission.pku.edu.cn",
    )
    path = tmp_path / "candidates.jsonl"
    path.write_text(
        json.dumps(
            {
                "universityName": "北京大学",
                "url": "https://admission.pku.edu.cn/xly/index.htm",
                "title": "北京大学2026年夏令营",
            },
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    candidates = load_candidates_file(path, {target.id: target, target.name: target})

    assert len(candidates) == 1
    assert candidates[0].university_id == "backend-pku"
    assert candidates[0].source == "file"


def test_candidate_prefilter_keeps_positive_school_result():
    target = UniversityTarget(
        id="fudan",
        name="复旦大学",
        priority="P0",
        website="https://www.fudan.edu.cn",
        grad_website="https://gsao.fudan.edu.cn",
    )
    candidate = SearchCandidate(
        university_id="fudan",
        university_name="复旦大学",
        url="https://gsao.fudan.edu.cn/sszs/2026xly.htm",
        title="复旦大学2026年优秀大学生夏令营通知",
    )

    assert candidate_passes_prefilter(candidate, target)


def test_candidate_prefilter_rejects_negative_or_attachment_result():
    target = UniversityTarget(
        id="zju",
        name="浙江大学",
        priority="P0",
        website="https://www.zju.edu.cn",
        grad_website="https://www.grs.zju.edu.cn/yjszs",
    )

    assert not candidate_passes_prefilter(
        SearchCandidate(
            university_id="zju",
            university_name="浙江大学",
            url="https://www.grs.zju.edu.cn/yjszs/2026.pdf",
            title="浙江大学2026年推免报名材料",
        ),
        target,
    )
    assert not candidate_passes_prefilter(
        SearchCandidate(
            university_id="zju",
            university_name="浙江大学",
            url="https://www.grs.zju.edu.cn/yjszs/list.htm",
            title="浙江大学2026年博士招生申请考核通知",
        ),
        target,
    )


def test_candidate_prefilter_rejects_shared_blocked_hosts_and_patterns():
    csu = UniversityTarget(
        id="csu",
        name="中南大学",
        priority="P1",
        website="https://www.csu.edu.cn",
        grad_website="https://yz.csu.edu.cn",
        entry_points=["https://yz.csu.edu.cn/"],
    )

    assert not candidate_passes_prefilter(
        SearchCandidate(
            university_id="csu",
            university_name="中南大学",
            url="https://yjszsgl.csu.edu.cn/zsgl2025/tmsgl/default.aspx",
            title="夏令营报名系统",
        ),
        csu,
    )

    pku = UniversityTarget(
        id="pku",
        name="北京大学",
        priority="P0",
        website="https://www.pku.edu.cn",
        grad_website="https://admission.pku.edu.cn",
        entry_points=["https://admission.pku.edu.cn/xly/index.htm"],
    )

    assert not candidate_passes_prefilter(
        SearchCandidate(
            university_id="pku",
            university_name="北京大学",
            url="https://econ.pku.edu.cn/jxxm/zsxxfb_20211202144549787517/389994.htm",
            title="北京大学经济学院关于举办2025年优秀大学生夏令营活动的通知",
        ),
        pku,
    )


def test_dedupe_candidates_by_school_and_url_without_fragment():
    candidates = [
        SearchCandidate("thu", "清华大学", "https://yz.tsinghua.edu.cn/a.htm#top"),
        SearchCandidate("thu", "清华大学", "https://yz.tsinghua.edu.cn/a.htm"),
        SearchCandidate("pku", "北京大学", "https://yz.tsinghua.edu.cn/a.htm"),
    ]

    deduped = dedupe_candidates(candidates)

    assert len(deduped) == 2


def test_targets_from_crawl_overrides_supports_local_p0_p1_fallback():
    targets = targets_from_crawl_overrides({"P0", "P1"}, set())
    names = {target.name for target in targets}

    assert "清华大学" in names
    assert "北京航空航天大学" in names
    assert all(target.priority in {"P0", "P1"} for target in targets)


def test_choose_title_prefers_positive_candidate_over_generic_page_title():
    spider = UniversitySpider()

    title = choose_title(
        spider,
        "人才培养",
        "北京大学智能学院2026年接收推荐免试研究生说明",
        "",
    )

    assert title == "北京大学智能学院2026年接收推荐免试研究生说明"


def test_choose_response_encoding_uses_apparent_encoding_for_default_latin1():
    class FakeResponse:
        encoding = "ISO-8859-1"
        apparent_encoding = "UTF-8-SIG"

    assert choose_response_encoding(FakeResponse()) == "UTF-8-SIG"


def test_extract_page_links_reads_window_open_links():
    links = extract_page_links(
        "http://yz.example.edu.cn/column/202?num=-1",
        """
        <html><head><title>推免专栏</title></head><body>
          <li onclick="window.open('/article/2793/202?num=-1','_blank')">
            <span title="示例大学2026年推免生接收办法">示例大学2026年推免生接收办法</span>
          </li>
        </body></html>
        """,
    )

    assert links[0]["url"] == "http://yz.example.edu.cn/article/2793/202?num=-1"
    assert "2026年推免生接收办法" in links[0]["title"]


def test_extract_page_links_uses_heading_for_direct_detail_page():
    links = extract_page_links(
        "https://yz.example.edu.cn/tzgg/detail.htm",
        """
        <html><head><title>示例大学研究生招生信息网</title></head><body>
          <h1>示例大学2026年接收推荐免试研究生预报名通知</h1>
          <p>申请条件和报名材料如下。</p>
        </body></html>
        """,
    )

    assert links[-1]["url"] == "https://yz.example.edu.cn/tzgg/detail.htm"
    assert "接收推荐免试研究生" in links[-1]["title"]


def test_infer_announcement_type_from_search_hint_distinguishes_pre_recommendation():
    assert (
        infer_announcement_type_from_search_hint("北京大学智能学院2026年接收推荐免试研究生说明")
        == "pre_recommendation"
    )
    assert infer_announcement_type_from_search_hint("优秀大学生暑期夏令营报名通知") == "summer_camp"


def test_target_discovery_signal_filters_generic_admission_noise():
    assert has_target_discovery_signal("示例大学2026年优秀大学生夏令营通知")
    assert has_target_discovery_signal("示例大学2026年接收推荐免试研究生办法")
    assert not has_target_discovery_signal("示例大学2026年博士研究生招生简章")
    assert has_candidate_negative_signal("示例大学2026年硕士研究生拟录取名单公示")
    assert has_candidate_negative_signal("2026年拟推荐免试攻读研究生学生名单汇总表")
    assert has_candidate_negative_signal("优秀大学生夏令营圆满举行")


def test_write_coverage_report_outputs_markdown_table(tmp_path):
    path = tmp_path / "coverage.md"

    write_coverage_report(
        path,
        [
            {
                "universityId": "pku",
                "universityName": "北京大学",
                "priority": "P0",
                "candidates": 3,
                "prefiltered": 0,
                "fetched": 3,
                "emitted": 2,
                "limitedOut": 0,
                "dropReasons": {"year_out_of_range": 1},
                "errors": [],
            }
        ],
    )

    text = path.read_text(encoding="utf-8")
    assert "# Search Discovery Coverage" in text
    assert "| P0 | 北京大学 | 3 | 3 | 2 | 0 | 0 | year_out_of_range:1 | 0 |" in text


def test_extract_item_drops_short_candidate_only_body():
    spider = UniversitySpider()
    spider.target_years = [2026, 2025]
    target = UniversityTarget(id="nju", name="南京大学", priority="P0", website="https://www.nju.edu.cn")
    candidate = SearchCandidate(
        university_id="nju",
        university_name="南京大学",
        url="https://yzb.nju.edu.cn/demo.htm",
        title="南京大学2026年接收推荐免试研究生预报名通知",
        snippet="南京大学2026年推免生预报名。",
    )
    response = HtmlResponse(
        url=candidate.url,
        body="<html><head><title>南京大学</title></head><body>短正文</body></html>",
        encoding="utf-8",
        request=Request(url=candidate.url, meta={"university": {"id": "nju", "name": "南京大学"}}),
    )

    item, reason = extract_item(spider, candidate, target, response, 10, 12000)

    assert item is None
    assert reason == "content_too_short"


def test_spider_extract_content_supports_common_school_cms_article_classes():
    spider = UniversitySpider()
    response = HtmlResponse(
        url="https://ic.pku.edu.cn/demo.htm",
        body="""
        <html><body>
          <div class="gp-article">
            <p>北京大学集成电路学院将面向优秀本科生举办夏令营活动。</p>
            <p>申请人须按要求提交报名材料并参加考核。</p>
            <p>本次活动包括学院介绍、学科前沿报告、专业交流和综合能力考察，欢迎相关专业学生申请。</p>
          </div>
        </body></html>
        """,
        encoding="utf-8",
    )

    content = spider.extract_content(response)

    assert "优秀本科生举办夏令营活动" in content
    assert "提交报名材料" in content


def test_spider_extract_content_supports_plain_article_class():
    spider = UniversitySpider()
    response = HtmlResponse(
        url="https://yz.cau.edu.cn/demo.htm",
        body="""
        <html><body>
          <div class="article">
            <p>示例大学各院系2026年接收推荐免试研究生工作实施细则。</p>
            <p>申请人应按学院要求提交报名材料，并关注各院系复核安排。</p>
            <p>相关学院包括农学院、资源与环境学院、食品科学与营养工程学院、信息与电气工程学院。</p>
          </div>
        </body></html>
        """,
        encoding="utf-8",
    )

    content = spider.extract_content(response)

    assert "接收推荐免试研究生工作实施细则" in content
    assert "食品科学与营养工程学院" in content


def test_spider_extracts_contextual_deadline_and_event_dates():
    spider = UniversitySpider()
    content = (
        "发布时间：2025-06-26。报名截止时间：6月30日17:00。"
        "活动时间：2025年7月14日至2025年7月16日。"
    )

    assert spider.extract_deadline(content) == "2025-06-30T17:00:00"
    assert spider.extract_event_date(content, ["活动时间"], pick="start") == "2025-07-14T00:00:00"
    assert spider.extract_event_date(content, ["活动时间"], pick="end") == "2025-07-16T00:00:00"


def test_spider_extracts_deadline_from_application_time_range():
    spider = UniversitySpider()
    content = "发布时间：2025-06-26。报名时间：即日起至6月20日24：00截止，报名地址为系统平台。"

    assert spider.extract_deadline(content) == "2025-06-20T23:59:00"


def test_spider_extract_with_ai_falls_back_to_full_content_for_deadline():
    spider = UniversitySpider()
    response = HtmlResponse(
        url="https://example.edu.cn/demo.htm",
        body="<html></html>",
        encoding="utf-8",
    )
    content = (
        "发布时间：2025-06-01。\n"
        "报名时间：即日起至6月20日24：00截止。\n"
        "申请材料\n"
        "1.申请表。2.成绩单。3.推荐信。"
    )

    info = spider.extract_with_ai(response, "示例大学2025年优秀大学生夏令营通知", content, {"id": "demo"})

    assert info["deadline"] == "2025-06-20T23:59:00"


def test_spider_does_not_use_recruitment_year_as_partial_date_default():
    spider = UniversitySpider()
    content = "上海交通大学机械与动力工程学院2026年研究生优才夏令营报名通知。报名时间：6月3日9:00-7月3日9:00。"

    assert spider.extract_deadline(content) is None


def test_spider_does_not_use_unrelated_standalone_year_as_partial_date_default():
    spider = UniversitySpider()
    content = (
        "上海交通大学机械与动力工程学院2026年研究生优才夏令营报名通知。"
        "工程硕博士专项自2022年起开始招生，校级基地专项自2021年起开始招生。"
        "报名时间：6月3日9:00-7月3日9:00。"
    )

    assert spider.extract_deadline(content) is None


def test_spider_event_date_does_not_fallback_to_publish_date_without_label():
    spider = UniversitySpider()
    content = "发布时间：2025-06-26。申请人须在系统中完成报名并提交材料。"

    assert spider.extract_event_date(content, ["活动时间"], pick="start") is None


def test_extract_attachment_links_reads_pdfsrc_and_docx_links():
    response = HtmlResponse(
        url="https://yzb.nju.edu.cn/07/0a/c47863a788234/page.htm",
        body="""
        <html><body>
          <div pdfsrc="/files/main.pdf"></div>
          <script>showVsbpdfIframe("/__local/main.pdf","100%","600","0","",[]);</script>
          <a href="/files/material.docx" sudyfile-attr="{'title':'申请材料清单.docx'}">附件</a>
        </body></html>
        """,
        encoding="utf-8",
    )

    links = extract_attachment_links(response)

    assert links == [
        {"url": "https://yzb.nju.edu.cn/files/main.pdf", "title": "PDF正文"},
        {"url": "https://yzb.nju.edu.cn/__local/main.pdf", "title": "PDF正文"},
        {"url": "https://yzb.nju.edu.cn/files/material.docx", "title": "{'title':'申请材料清单.docx'}"},
    ]


def test_extract_item_uses_attachment_text_when_html_body_is_short(monkeypatch):
    spider = UniversitySpider()
    spider.target_years = [2026]
    target = UniversityTarget(id="nju", name="南京大学", priority="P0", website="https://www.nju.edu.cn")
    candidate = SearchCandidate(
        university_id="nju",
        university_name="南京大学",
        url="https://yzb.nju.edu.cn/demo.htm",
        title="南京大学2026年接收推荐免试研究生工作办法",
    )
    response = HtmlResponse(
        url=candidate.url,
        body="<html><head><title>南京大学2026年接收推荐免试研究生工作办法</title></head><body><p>附件</p></body></html>",
        encoding="utf-8",
        request=Request(url=candidate.url, meta={"university": {"id": "nju", "name": "南京大学"}}),
    )

    monkeypatch.setattr(
        "scripts.search_discovery_mvp.extract_attachment_texts",
        lambda response, timeout: [
            "南京大学2026年接收推荐免试研究生工作办法。申请条件包括取得推荐免试资格。"
            "申请人须提交报名材料、成绩单、推荐信，并按院系要求参加综合考核。"
            "学校将根据材料审核和综合考核结果择优录取，相关通知以研究生招生网发布为准。"
            "申请材料应真实完整，所有证明文件须按报名系统要求上传。未按时完成报名、材料不齐全"
            "或不符合申请条件者，不进入后续审核环节。各院系可根据学科特点制定具体实施细则。"
            "本办法由南京大学研究生院负责解释，后续安排如有调整，将另行在官方网站公布。"
        ],
    )

    item, reason = extract_item(spider, candidate, target, response, 10, 12000)

    assert reason == "emitted"
    assert item["announcementType"] == "pre_recommendation"
    assert "取得推荐免试资格" in item["content"]


def test_write_candidates_outputs_jsonl_records(tmp_path):
    path = tmp_path / "candidates.jsonl"

    write_candidates(
        path,
        [
            SearchCandidate(
                university_id="pku",
                university_name="北京大学",
                url="https://example.edu.cn/a.htm",
                title="北京大学2026年推免通知",
                query="北京大学 2026 推免",
                source="bing",
            )
        ],
    )

    row = json.loads(path.read_text(encoding="utf-8").strip())
    assert row["universityId"] == "pku"
    assert row["source"] == "bing"


def test_merge_ingest_summaries_sums_batches_and_errors():
    merged = merge_ingest_summaries(
        [
            {"processed": 2, "created": 1, "updated": 1, "errors": [{"index": 1, "reason": "x"}]},
            {"processed": 3, "created": 2, "unchanged": 1, "eventsCreated": 4, "errors": []},
        ]
    )

    assert merged["batches"] == 2
    assert merged["processed"] == 5
    assert merged["created"] == 3
    assert merged["updated"] == 1
    assert merged["unchanged"] == 1
    assert merged["eventsCreated"] == 4
    assert merged["errors"] == [{"index": 1, "reason": "x"}]


def test_resolve_search_provider_prefers_serpapi_then_serper_then_brave(monkeypatch):
    monkeypatch.delenv("SERPAPI_API_KEY", raising=False)
    monkeypatch.delenv("SERPER_API_KEY", raising=False)
    monkeypatch.setenv("BRAVE_SEARCH_API_KEY", "brave-key")
    monkeypatch.setenv("BING_SEARCH_API_KEY", "bing-key")

    assert resolve_search_provider("auto") == ("brave", "brave-key")

    monkeypatch.setenv("SERPER_API_KEY", "serper-key")

    assert resolve_search_provider("auto") == ("serper", "serper-key")
    assert resolve_search_provider("brave") == ("brave", "brave-key")

    monkeypatch.setenv("SERPAPI_API_KEY", "serpapi-key")

    assert resolve_search_provider("auto") == ("serpapi", "serpapi-key")
    assert resolve_search_provider("serpapi") == ("serpapi", "serpapi-key")


def test_resolve_search_provider_falls_back_to_free_site_provider(monkeypatch):
    monkeypatch.delenv("SERPAPI_API_KEY", raising=False)
    monkeypatch.delenv("SERPER_API_KEY", raising=False)
    monkeypatch.delenv("BRAVE_SEARCH_API_KEY", raising=False)
    monkeypatch.delenv("BING_SEARCH_API_KEY", raising=False)

    assert resolve_search_provider("auto") == ("site", "local")
    assert resolve_search_provider("site") == ("site", "local")


def test_discover_site_candidates_reads_sitemap_and_entry_page(monkeypatch):
    target = UniversityTarget(
        id="demo",
        name="示例大学",
        priority="P0",
        website="https://www.example.edu.cn",
        grad_website="https://yz.example.edu.cn",
        entry_points=["https://yz.example.edu.cn/tzgg/index.htm"],
    )

    class FakeResponse:
        def __init__(self, text, content_type="text/html"):
            self.text = text
            self.headers = {"content-type": content_type}
            self.encoding = "utf-8"

        def raise_for_status(self):
            return None

    def fake_get(url, headers, timeout):
        if url.endswith("/sitemap.xml"):
            return FakeResponse(
                """
                <urlset>
                  <url><loc>https://yz.example.edu.cn/info/1001/2026推免.htm</loc></url>
                  <url><loc>https://yz.example.edu.cn/info/1001/intro.htm</loc></url>
                </urlset>
                """,
                "application/xml",
            )
        if url == "https://yz.example.edu.cn/tzgg/index.htm":
            return FakeResponse(
                """
                <html><head><title>招生通知</title></head><body>
                  <a href="/info/1002/xly2026.htm" title="示例大学2026年优秀大学生夏令营通知">更多</a>
                  <a href="https://other.edu.cn/info/1002/xly2026.htm">外校夏令营</a>
                </body></html>
                """
            )
        raise RuntimeError(url)

    monkeypatch.setattr("scripts.search_discovery_mvp.requests.get", fake_get)

    candidates = discover_site_candidates(target, [2026], per_query=5, max_queries_per_school=2, timeout=10)
    urls = {candidate.url for candidate in candidates}

    assert "https://yz.example.edu.cn/info/1001/2026推免.htm" in urls
    assert "https://yz.example.edu.cn/info/1002/xly2026.htm" in urls
    assert all(candidate.source.startswith("site:") for candidate in candidates)


def test_search_serper_parses_organic_results(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "organic": [
                    {
                        "link": "https://example.edu.cn/a.htm",
                        "title": "示例大学2026年推免通知",
                        "snippet": "推荐免试研究生",
                    }
                ]
            }

    captured = {}

    def fake_post(url, headers, json, timeout):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr("scripts.search_discovery_mvp.requests.post", fake_post)

    results = search_serper("示例大学 推免", "key", 5, 10, "cn", "zh-cn")

    assert captured["headers"]["X-API-KEY"] == "key"
    assert captured["json"]["num"] == 5
    assert results == [
        {
            "url": "https://example.edu.cn/a.htm",
            "title": "示例大学2026年推免通知",
            "snippet": "推荐免试研究生",
        }
    ]


def test_search_brave_parses_web_results(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "web": {
                    "results": [
                        {
                            "url": "https://example.edu.cn/b.htm",
                            "title": "示例大学2026年夏令营通知",
                            "description": "优秀大学生夏令营",
                        }
                    ]
                }
            }

    captured = {}

    def fake_get(url, headers, params, timeout):
        captured["headers"] = headers
        captured["params"] = params
        return FakeResponse()

    monkeypatch.setattr("scripts.search_discovery_mvp.requests.get", fake_get)

    results = search_brave("示例大学 夏令营", "key", 3, 10, "cn", "zh")

    assert captured["headers"]["X-Subscription-Token"] == "key"
    assert captured["params"]["count"] == 3
    assert results == [
        {
            "url": "https://example.edu.cn/b.htm",
            "title": "示例大学2026年夏令营通知",
            "snippet": "优秀大学生夏令营",
        }
    ]


def test_search_serpapi_parses_organic_results(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "organic_results": [
                    {
                        "link": "https://example.edu.cn/c.htm",
                        "title": "示例大学2026年预推免通知",
                        "snippet": "推荐免试研究生预报名",
                    }
                ]
            }

    captured = {}

    def fake_get(url, params, timeout):
        captured["url"] = url
        captured["params"] = params
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr("scripts.search_discovery_mvp.requests.get", fake_get)

    results = search_serpapi("示例大学 预推免", "key", 7, 10, "cn", "zh-cn")

    assert captured["params"]["engine"] == "google"
    assert captured["params"]["api_key"] == "key"
    assert captured["params"]["num"] == 7
    assert results == [
        {
            "url": "https://example.edu.cn/c.htm",
            "title": "示例大学2026年预推免通知",
            "snippet": "推荐免试研究生预报名",
        }
    ]

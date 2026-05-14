#!/usr/bin/env python3
"""
Search-first discovery MVP for baoyan camp announcements.

This script avoids deep crawling school websites. It discovers likely announcement
detail URLs through a search provider or a local candidate file, fetches each
detail page, reuses the existing UniversitySpider extraction helpers, and writes
backend-ready JSONL items.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
import zipfile
from io import BytesIO
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import quote_plus, urldefrag, urljoin, urlparse
from xml.etree import ElementTree

import requests
from scrapy.http import HtmlResponse, Request

ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ROOT.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from baoyan_crawler.spiders.university_spider import UniversitySpider  # noqa: E402


def request_timeout(timeout: int) -> tuple[int, int]:
    read_timeout = max(1, int(timeout or 1))
    connect_timeout = max(1, min(3, read_timeout))
    return (connect_timeout, read_timeout)


POSITIVE_KEYWORDS = [
    "夏令营",
    "暑期学校",
    "优秀大学生",
    "推免",
    "预推免",
    "推荐免试",
    "免试攻读",
    "推免生",
    "直博",
    "预报名",
]

TARGET_DISCOVERY_KEYWORDS = [
    "夏令营",
    "暑期学校",
    "优秀大学生",
    "推免",
    "预推免",
    "推荐免试",
    "免试攻读",
    "推免生",
]

NEGATIVE_KEYWORDS = [
    "申请考核",
    "港澳台",
    "招生目录",
    "专业目录",
    "复试",
    "分数线",
    "考点",
    "考试",
    "答题纸",
    "成绩查询",
    "考前提醒",
    "网上确认",
    "初试",
    "统考",
]

CANDIDATE_NEGATIVE_KEYWORDS = [
    *NEGATIVE_KEYWORDS,
    "调剂",
    "拟录取",
    "录取名单",
    "名单公示",
    "复试录取",
    "开营仪式",
    "开营暨",
    "校园开放周",
    "工作布置会议",
    "导师信息",
    "现场咨询会",
    "政策咨询会",
    "拟推荐免试",
    "拟推荐",
    "优秀营员名单",
    "圆满举行",
    "圆满落幕",
    "汇总表",
    "暂未开放",
]

HARD_NEGATIVE_KEYWORDS = [
    "港澳台",
    "招生目录",
    "专业目录",
    "成绩查询",
    "考前提醒",
    "网上确认",
    "初试",
    "统考",
]

HTML_CONTENT_TYPES = ["text/html", "application/xhtml+xml", ""]
MIN_EMIT_CONTENT_CHARS = 200
MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024

SITE_DISCOVERY_HINTS = [
    "通知",
    "公告",
    "招生",
    "硕士",
    "研究生",
    "报名",
    "培养",
    "夏令营",
    "推免",
    "预推免",
    "推荐免试",
]

COMMON_SITEMAP_PATHS = [
    "/sitemap.xml",
    "/sitemap.txt",
]

SITE_SEARCH_PATHS = [
    "/search.htm?keyword={query}",
    "/search.html?keyword={query}",
    "/search.jsp?keyword={query}",
    "/ssjgy.jsp?wbtreeid=1001&searchScope=0&currentnum=1&newskeycode2={query}",
]

GENERIC_PAGE_TITLES = {
    "首页",
    "正文",
    "人才培养",
    "通知公告",
    "招生信息",
    "招生公告",
    "研究生招生",
    "研究生院",
}

GENERIC_BLOCKED_CANDIDATE_URL_PATTERNS = [
    "download.jsp",
    "dd_article_attachment",
    "wbfileid=",
    "/system/_content/download",
    "/zsxt",
    "/zsgl",
    "default.aspx",
    "login",
]


@dataclass
class UniversityTarget:
    id: str
    name: str
    priority: str
    website: str = ""
    grad_website: str = ""
    entry_points: List[str] = field(default_factory=list)


@dataclass
class SearchCandidate:
    university_id: str
    university_name: str
    url: str
    title: str = ""
    snippet: str = ""
    query: str = ""
    source: str = "unknown"


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def get_host(url: str) -> str:
    return (urlparse(url or "").hostname or "").lower()


def get_registrable_host(hostname: str) -> str:
    host = (hostname or "").lower().strip(".")
    if not host:
        return ""
    parts = host.split(".")
    if len(parts) <= 2:
        return host
    suffix = ".".join(parts[-2:])
    if suffix in {"edu.cn", "ac.cn", "gov.cn", "org.cn", "com.cn", "net.cn"} and len(parts) >= 3:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def clean_url(url: str) -> str:
    cleaned, _fragment = urldefrag(normalize_text(url))
    return cleaned


def same_site(url: str, target: UniversityTarget) -> bool:
    candidate_host = get_registrable_host(get_host(url))
    target_hosts = {
        get_registrable_host(get_host(target.website)),
        get_registrable_host(get_host(target.grad_website)),
    }
    for entry_point in target.entry_points:
        target_hosts.add(get_registrable_host(get_host(entry_point)))
    return bool(candidate_host and candidate_host in target_hosts)


def has_positive_signal(*values: str) -> bool:
    merged = normalize_text(" ".join(values))
    return any(keyword in merged for keyword in POSITIVE_KEYWORDS)


def has_negative_signal(*values: str) -> bool:
    merged = normalize_text(" ".join(values))
    return any(keyword in merged for keyword in NEGATIVE_KEYWORDS)


def has_candidate_negative_signal(*values: str) -> bool:
    merged = normalize_text(" ".join(values))
    return any(keyword in merged for keyword in CANDIDATE_NEGATIVE_KEYWORDS)


def has_hard_negative_signal(*values: str) -> bool:
    merged = normalize_text(" ".join(values))
    return any(keyword in merged for keyword in HARD_NEGATIVE_KEYWORDS)


def is_probably_html_url(url: str) -> bool:
    lowered = (url or "").lower().split("?", 1)[0]
    return not lowered.endswith((".pdf", ".doc", ".docx", ".xls", ".xlsx", ".zip", ".rar", ".jpg", ".png"))


def looks_like_discovery_url(url: str, text: str = "") -> bool:
    merged = normalize_text(f"{url} {text}")
    return any(keyword in merged for keyword in SITE_DISCOVERY_HINTS)


def has_target_discovery_signal(*values: str) -> bool:
    merged = normalize_text(" ".join(values))
    return any(keyword in merged for keyword in TARGET_DISCOVERY_KEYWORDS)


def choose_response_encoding(resp: requests.Response) -> str:
    encoding = normalize_text(resp.encoding).lower()
    if not encoding or encoding == "iso-8859-1":
        return resp.apparent_encoding or "utf-8"
    return resp.encoding or "utf-8"


def choose_title(spider: UniversitySpider, page_title: str, candidate_title: str, extracted_title: str) -> str:
    cleaned_page = spider.clean_title(page_title or "")
    cleaned_candidate = spider.clean_title(candidate_title or "")
    cleaned_extracted = spider.clean_title(extracted_title or "")
    if cleaned_candidate and (
        cleaned_page in GENERIC_PAGE_TITLES
        or len(cleaned_page) < 8
        or (has_positive_signal(cleaned_candidate) and not has_positive_signal(cleaned_page))
    ):
        return cleaned_candidate
    return cleaned_page or cleaned_candidate or cleaned_extracted


def infer_announcement_type_from_search_hint(*values: str) -> Optional[str]:
    merged = normalize_text(" ".join(values))
    if re.search(r"预推免|推免生|推荐免试|免试攻读|免试研究生|预报名", merged, re.IGNORECASE):
        return "pre_recommendation"
    if re.search(r"夏令营|暑期学校|优秀大学生|summer", merged, re.IGNORECASE):
        return "summer_camp"
    return None


def load_crawl_overrides() -> Dict[str, Dict[str, Any]]:
    path = PROJECT_ROOT / "shared" / "crawl-overrides.json"
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if not isinstance(rows, list):
        return {}
    return {normalize_text(row.get("name")): row for row in rows if isinstance(row, dict) and row.get("name")}


def load_site_crawl_rules() -> Dict[str, Any]:
    path = PROJECT_ROOT / "shared" / "site-crawl-rules.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def is_blocked_candidate_url(url: str) -> bool:
    rules = load_site_crawl_rules()
    host = get_host(url)
    if not host:
        return False
    blocked_hosts = {normalize_text(item).lower() for item in rules.get("blockedDetailHosts") or []}
    if host in blocked_hosts:
        return True
    normalized_url = (url or "").lower()
    if any(pattern in normalized_url for pattern in GENERIC_BLOCKED_CANDIDATE_URL_PATTERNS):
        return True
    patterns = (rules.get("blockedLinkPatterns") or {}).get(host, [])
    return any(str(pattern).lower() in normalized_url for pattern in patterns)


def targets_from_crawl_overrides(
    priorities: set[str],
    university_ids: set[str],
) -> List[UniversityTarget]:
    targets = []
    for row in load_crawl_overrides().values():
        name = normalize_text(row.get("name"))
        slug = normalize_text(row.get("slug")) or name
        priority = normalize_text(row.get("priority")) or "P2"
        if not name or not slug:
            continue
        if priorities and priority not in priorities:
            continue
        if university_ids and slug not in university_ids and name not in university_ids:
            continue
        targets.append(
            UniversityTarget(
                id=slug,
                name=name,
                priority=priority,
                website=normalize_text(row.get("website")),
                grad_website=normalize_text(row.get("gradWebsite") or row.get("grad_website") or row.get("website")),
                entry_points=[
                    normalize_text(url)
                    for url in row.get("entryPoints", [])
                    if normalize_text(url)
                ],
            )
        )
    return targets


def load_universities_from_backend(
    backend_base_url: str,
    priorities: set[str],
    university_ids: set[str],
    timeout: int,
) -> List[UniversityTarget]:
    rows: List[Dict[str, Any]] = []
    page = 1
    total_pages = 1
    while page <= total_pages:
        resp = requests.get(
            f"{backend_base_url.rstrip('/')}/api/v1/universities",
            params={"page": page, "limit": 100, "sortBy": "priority", "sortOrder": "asc"},
            timeout=timeout,
        )
        resp.raise_for_status()
        payload = resp.json()
        page_rows = payload.get("data") if isinstance(payload, dict) else []
        meta = payload.get("meta") if isinstance(payload, dict) else {}
        if not page_rows:
            break
        rows.extend(page_rows)
        total_pages = int(meta.get("totalPages") or 1)
        page += 1

    overrides = load_crawl_overrides()
    targets: List[UniversityTarget] = []
    for row in rows:
        university_id = normalize_text(row.get("id"))
        name = normalize_text(row.get("name"))
        priority = normalize_text(row.get("priority"))
        if not university_id or not name:
            continue
        if priorities and priority not in priorities:
            continue
        if university_ids and university_id not in university_ids and name not in university_ids:
            continue
        override = overrides.get(name, {})
        website = normalize_text(row.get("website") or override.get("website"))
        grad_website = normalize_text(override.get("gradWebsite") or override.get("grad_website") or website)
        entry_points = [
            normalize_text(url)
            for url in override.get("entryPoints", [])
            if normalize_text(url)
        ]
        targets.append(
            UniversityTarget(
                id=university_id,
                name=name,
                priority=priority,
                website=website,
                grad_website=grad_website,
                entry_points=entry_points,
            )
        )
    return targets


def load_university_targets(
    backend_base_url: str,
    priorities: set[str],
    university_ids: set[str],
    timeout: int,
    allow_local_fallback: bool = True,
) -> List[UniversityTarget]:
    try:
        targets = load_universities_from_backend(
            backend_base_url,
            priorities,
            university_ids,
            timeout,
        )
        if targets:
            return targets
    except Exception as exc:
        if not allow_local_fallback:
            raise
        print(f"[search-discovery] backend target load failed, using crawl-overrides fallback: {exc}", file=sys.stderr)
    return targets_from_crawl_overrides(priorities, university_ids) if allow_local_fallback else []


def write_queries(path: Path, targets: List[UniversityTarget], years: List[int], max_queries_per_school: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for target in targets:
        for query in build_queries(target, years)[:max_queries_per_school]:
            rows.append(
                {
                    "universityId": target.id,
                    "universityName": target.name,
                    "priority": target.priority,
                    "query": query,
                }
            )
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def build_queries(university: UniversityTarget, years: Iterable[int]) -> List[str]:
    years = [int(year) for year in years]
    host_candidates = []
    for url in [university.grad_website, university.website]:
        host = get_host(url)
        if host and host not in host_candidates:
            host_candidates.append(host)
        root = get_registrable_host(host)
        if root and root not in host_candidates:
            host_candidates.append(root)

    queries: List[str] = []
    for year in years:
        queries.extend(
            [
                f"{university.name} {year} 夏令营 推免",
                f"{university.name} {year} 推荐免试 预报名",
            ]
        )
        for host in host_candidates[:3]:
            queries.extend(
                [
                    f"site:{host} {year} 夏令营",
                    f"site:{host} {year} 推荐免试",
                    f"site:{host} {year} 预推免",
                ]
            )
    return list(dict.fromkeys(queries))


def build_site_seed_urls(target: UniversityTarget, mode: str = "full") -> List[str]:
    urls: List[str] = []
    urls.extend(target.entry_points)
    urls.extend([target.grad_website, target.website])
    if mode == "entry":
        return list(dict.fromkeys(clean_url(url) for url in urls if normalize_text(url)))
    for base in [target.grad_website, target.website, *target.entry_points[:3]]:
        parsed = urlparse(base or "")
        if not parsed.scheme or not parsed.netloc:
            continue
        origin = f"{parsed.scheme}://{parsed.netloc}"
        urls.extend(
            [
                origin,
                urljoin(origin, "/"),
                urljoin(origin, "/tzgg.htm"),
                urljoin(origin, "/tzgg/index.htm"),
                urljoin(origin, "/zsxx.htm"),
                urljoin(origin, "/zsxx/index.htm"),
                urljoin(origin, "/yjszs.htm"),
                urljoin(origin, "/yjszs/index.htm"),
                urljoin(origin, "/xly.htm"),
                urljoin(origin, "/xly/index.htm"),
            ]
        )
    return list(dict.fromkeys(clean_url(url) for url in urls if normalize_text(url)))


def build_sitemap_urls(target: UniversityTarget) -> List[str]:
    urls: List[str] = []
    for base in [target.grad_website, target.website, *target.entry_points[:2]]:
        parsed = urlparse(base or "")
        if not parsed.scheme or not parsed.netloc:
            continue
        origin = f"{parsed.scheme}://{parsed.netloc}"
        for path in COMMON_SITEMAP_PATHS:
            urls.append(urljoin(origin, path))
    return list(dict.fromkeys(urls))


def build_site_search_urls(target: UniversityTarget, years: List[int], max_queries: int) -> List[str]:
    urls: List[str] = []
    queries = build_queries(target, years)[:max_queries]
    for base in [target.grad_website, target.website]:
        parsed = urlparse(base or "")
        if not parsed.scheme or not parsed.netloc:
            continue
        origin = f"{parsed.scheme}://{parsed.netloc}"
        for query in queries[:3]:
            encoded = quote_plus(query)
            for path in SITE_SEARCH_PATHS:
                urls.append(urljoin(origin, path.format(query=encoded)))
    return list(dict.fromkeys(urls))


def fetch_text(url: str, timeout: int) -> tuple[str, str]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
        )
    }
    resp = requests.get(url, headers=headers, timeout=request_timeout(timeout))
    resp.raise_for_status()
    content_type = (resp.headers.get("content-type") or "").split(";", 1)[0].lower()
    if content_type not in HTML_CONTENT_TYPES and content_type not in {"application/xml", "text/xml", "text/plain"}:
        return "", content_type
    resp.encoding = choose_response_encoding(resp)
    return resp.text, content_type


def extract_sitemap_links(text: str) -> List[str]:
    links = re.findall(r"<loc>\s*([^<]+)\s*</loc>", text, flags=re.IGNORECASE)
    if not links:
        links = re.findall(r"https?://[^\s<>\"]+", text)
    return [clean_url(link) for link in links]


def extract_page_links(page_url: str, html: str) -> List[Dict[str, str]]:
    response = HtmlResponse(url=page_url, body=html.encode("utf-8"), encoding="utf-8")
    page_title = normalize_text(
        " ".join(
            response.css("title::text").getall()
            + response.css("h1::text, h2::text, h3::text").getall()
        )
    )
    links = []
    for anchor in response.css("a"):
        href = normalize_text(anchor.attrib.get("href"))
        if not href or href.startswith(("javascript:", "mailto:", "#")):
            continue
        text = normalize_text(anchor.attrib.get("title") or " ".join(anchor.css("::text").getall()))
        links.append(
            {
                "url": clean_url(urljoin(page_url, href)),
                "title": text,
                "snippet": page_title,
            }
        )
    for node in response.css("[onclick*='window.open']"):
        onclick = normalize_text(node.attrib.get("onclick"))
        match = re.search(r"window\.open\(['\"]([^'\"]+)['\"]", onclick)
        if not match:
            continue
        text = normalize_text(node.attrib.get("title") or " ".join(node.css("::text").getall()))
        links.append(
            {
                "url": clean_url(urljoin(page_url, match.group(1))),
                "title": text,
                "snippet": page_title,
            }
        )
    if has_positive_signal(page_title, page_url):
        links.append({"url": clean_url(page_url), "title": page_title, "snippet": ""})
    return links


def extract_attachment_links(response: HtmlResponse) -> List[Dict[str, str]]:
    links: List[Dict[str, str]] = []
    seen: set[str] = set()

    def add(raw_url: str, title: str = "") -> None:
        url = clean_url(urljoin(response.url, raw_url))
        if not url or url in seen:
            return
        lowered = url.lower().split("?", 1)[0]
        if not lowered.endswith((".pdf", ".docx")):
            return
        seen.add(url)
        links.append({"url": url, "title": normalize_text(title)})

    for raw_url in response.css("[pdfsrc]::attr(pdfsrc)").getall():
        add(raw_url, "PDF正文")
    for script_text in response.css("script::text").getall():
        for raw_url in re.findall(r'showVsbpdfIframe\(["\']([^"\']+\.pdf)["\']', script_text, flags=re.IGNORECASE):
            add(raw_url, "PDF正文")
    for anchor in response.css("a[href]"):
        href = normalize_text(anchor.attrib.get("href"))
        title = normalize_text(
            anchor.attrib.get("title")
            or anchor.attrib.get("sudyfile-attr")
            or " ".join(anchor.css("::text").getall())
        )
        add(href, title)
    return links


def extract_pdf_text(data: bytes) -> str:
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception:
        return ""
    try:
        reader = PdfReader(BytesIO(data))
        lines = []
        for page in reader.pages[:8]:
            text = normalize_text(page.extract_text() or "")
            if text:
                lines.append(_clean_pdf_text(text))
        return "\n".join(lines)
    except Exception:
        return ""


def _clean_pdf_text(text: str) -> str:
    """Remove spurious spaces injected between Chinese characters by PDF extraction.
    Leaves spaces between Latin/digits and between Chinese/Latin boundaries intact."""
    if not text:
        return text
    # Collapse multiple spaces first
    cleaned = re.sub(r"[ \t]+", " ", text)
    # Remove space between two Chinese characters (most common PDF artifact)
    # Run twice to handle "中 文 字" → "中文字" (overlapping matches)
    for _ in range(2):
        cleaned = re.sub(r"([一-鿿]) ([一-鿿])", r"\1\2", cleaned)
    # Also remove space between Chinese char and Chinese punctuation
    cleaned = re.sub(r"([一-鿿]) ([，。、；：！？）】」』])", r"\1\2", cleaned)
    cleaned = re.sub(r"([（【「『]) ([一-鿿])", r"\1\2", cleaned)
    return cleaned


def extract_docx_text(data: bytes) -> str:
    try:
        with zipfile.ZipFile(BytesIO(data)) as archive:
            xml = archive.read("word/document.xml")
    except Exception:
        return ""
    try:
        root = ElementTree.fromstring(xml)
    except Exception:
        return ""
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs = []
    for paragraph in root.findall(".//w:p", namespace):
        text = "".join(node.text or "" for node in paragraph.findall(".//w:t", namespace))
        text = normalize_text(text)
        if text:
            paragraphs.append(text)
    return "\n".join(paragraphs)


def fetch_attachment_text(url: str, timeout: int) -> str:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
        )
    }
    resp = requests.get(url, headers=headers, timeout=request_timeout(timeout))
    resp.raise_for_status()
    data = resp.content[:MAX_ATTACHMENT_BYTES]
    lowered = url.lower().split("?", 1)[0]
    if lowered.endswith(".pdf"):
        return extract_pdf_text(data)
    if lowered.endswith(".docx"):
        return extract_docx_text(data)
    return ""


def extract_attachment_texts(response: HtmlResponse, timeout: int) -> List[str]:
    texts = []
    for attachment in extract_attachment_links(response)[:3]:
        text = fetch_attachment_text(attachment["url"], timeout)
        text = normalize_text(text)
        if text:
            title = attachment["title"]
            prefix = f"附件：{title}\n" if title else ""
            texts.append(prefix + text)
    return texts


def discover_site_candidates(
    target: UniversityTarget,
    years: List[int],
    per_query: int,
    max_queries_per_school: int,
    timeout: int,
    site_discovery_mode: str = "full",
) -> List[SearchCandidate]:
    candidates: List[SearchCandidate] = []
    seen_urls: set[str] = set()
    year_tokens = {str(year) for year in years}

    def add_candidate(url: str, title: str = "", snippet: str = "", source: str = "site") -> None:
        cleaned = clean_url(url)
        if not cleaned or cleaned in seen_urls:
            return
        if not cleaned.startswith(("http://", "https://")):
            return
        if is_blocked_candidate_url(cleaned):
            return
        if not is_probably_html_url(cleaned) or not same_site(cleaned, target):
            return
        signal = f"{cleaned} {title}"
        has_year = any(token in signal for token in year_tokens)
        if has_candidate_negative_signal(signal):
            return
        if not has_year:
            return
        if not has_target_discovery_signal(signal):
            return
        seen_urls.add(cleaned)
        candidates.append(
            SearchCandidate(
                university_id=target.id,
                university_name=target.name,
                url=cleaned,
                title=normalize_text(title),
                snippet=normalize_text(snippet),
                query="site-discovery",
                source=source,
            )
        )

    if site_discovery_mode == "full":
        for sitemap_url in build_sitemap_urls(target):
            try:
                text, _content_type = fetch_text(sitemap_url, timeout)
            except Exception:
                continue
            for link in extract_sitemap_links(text):
                add_candidate(link, source="site:sitemap")
                if len(candidates) >= per_query * max(1, max_queries_per_school):
                    return candidates

    seed_urls = build_site_seed_urls(target, site_discovery_mode)
    if site_discovery_mode == "full":
        seed_urls.extend(build_site_search_urls(target, years, max_queries_per_school))
    for seed_url in list(dict.fromkeys(seed_urls)):
        try:
            html, content_type = fetch_text(seed_url, timeout)
        except Exception:
            continue
        if content_type not in HTML_CONTENT_TYPES:
            continue
        for link in extract_page_links(seed_url, html):
            add_candidate(link["url"], link["title"], link["snippet"], source="site:page")
            if len(candidates) >= per_query * max(1, max_queries_per_school):
                return candidates
        time.sleep(0.1)
    return candidates


def search_bing(query: str, api_key: str, count: int, timeout: int) -> List[Dict[str, str]]:
    endpoint = os.getenv("BING_SEARCH_ENDPOINT", "https://api.bing.microsoft.com/v7.0/search")
    resp = requests.get(
        endpoint,
        headers={"Ocp-Apim-Subscription-Key": api_key},
        params={"q": query, "count": count, "mkt": "zh-CN", "responseFilter": "Webpages"},
        timeout=timeout,
    )
    resp.raise_for_status()
    payload = resp.json()
    results = []
    for item in ((payload.get("webPages") or {}).get("value") or []):
        results.append(
            {
                "url": normalize_text(item.get("url")),
                "title": normalize_text(item.get("name")),
                "snippet": normalize_text(item.get("snippet")),
            }
        )
    return results


def search_serper(query: str, api_key: str, count: int, timeout: int, gl: str, hl: str) -> List[Dict[str, str]]:
    endpoint = os.getenv("SERPER_SEARCH_ENDPOINT", "https://google.serper.dev/search")
    resp = requests.post(
        endpoint,
        headers={
            "X-API-KEY": api_key,
            "Content-Type": "application/json",
        },
        json={
            "q": query,
            "num": count,
            "gl": gl,
            "hl": hl,
        },
        timeout=timeout,
    )
    resp.raise_for_status()
    payload = resp.json()
    results = []
    for item in payload.get("organic") or []:
        results.append(
            {
                "url": normalize_text(item.get("link")),
                "title": normalize_text(item.get("title")),
                "snippet": normalize_text(item.get("snippet")),
            }
        )
    return results


def search_brave(query: str, api_key: str, count: int, timeout: int, country: str, search_lang: str) -> List[Dict[str, str]]:
    endpoint = os.getenv("BRAVE_SEARCH_ENDPOINT", "https://api.search.brave.com/res/v1/web/search")
    resp = requests.get(
        endpoint,
        headers={
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": api_key,
        },
        params={
            "q": query,
            "count": count,
            "country": country,
            "search_lang": search_lang,
            "spellcheck": 1,
        },
        timeout=timeout,
    )
    resp.raise_for_status()
    payload = resp.json()
    results = []
    for item in ((payload.get("web") or {}).get("results") or []):
        results.append(
            {
                "url": normalize_text(item.get("url")),
                "title": normalize_text(item.get("title")),
                "snippet": normalize_text(item.get("description") or item.get("snippet")),
            }
        )
    return results


def search_serpapi(query: str, api_key: str, count: int, timeout: int, gl: str, hl: str) -> List[Dict[str, str]]:
    endpoint = os.getenv("SERPAPI_SEARCH_ENDPOINT", "https://serpapi.com/search.json")
    resp = requests.get(
        endpoint,
        params={
            "engine": "google",
            "q": query,
            "api_key": api_key,
            "num": count,
            "gl": gl,
            "hl": hl,
        },
        timeout=timeout,
    )
    resp.raise_for_status()
    payload = resp.json()
    results = []
    for item in payload.get("organic_results") or []:
        results.append(
            {
                "url": normalize_text(item.get("link")),
                "title": normalize_text(item.get("title")),
                "snippet": normalize_text(item.get("snippet")),
            }
        )
    return results


def resolve_search_provider(provider: str) -> tuple[Optional[str], Optional[str]]:
    requested = (provider or "auto").strip().lower()
    keys = {
        "serpapi": os.getenv("SERPAPI_API_KEY", "").strip(),
        "serper": os.getenv("SERPER_API_KEY", "").strip(),
        "brave": os.getenv("BRAVE_SEARCH_API_KEY", "").strip(),
        "bing": os.getenv("BING_SEARCH_API_KEY", "").strip(),
        "site": "local",
    }
    if requested != "auto":
        return (requested, keys.get(requested))
    for name in ["serpapi", "serper", "brave", "bing"]:
        if keys[name]:
            return (name, keys[name])
    return ("site", keys["site"])


def run_search_provider(
    provider: str,
    query: str,
    api_key: str,
    count: int,
    timeout: int,
    gl: str,
    hl: str,
    country: str,
    search_lang: str,
) -> List[Dict[str, str]]:
    if provider == "serper":
        return search_serper(query, api_key, count, timeout, gl, hl)
    if provider == "brave":
        return search_brave(query, api_key, count, timeout, country, search_lang)
    if provider == "serpapi":
        return search_serpapi(query, api_key, count, timeout, gl, hl)
    if provider == "bing":
        return search_bing(query, api_key, count, timeout)
    raise ValueError(f"unsupported search provider: {provider}")


def load_candidates_file(path: Path, targets: Dict[str, UniversityTarget]) -> List[SearchCandidate]:
    if not path.exists():
        raise FileNotFoundError(path)
    text = path.read_text(encoding="utf-8").strip()
    rows: List[Dict[str, Any]] = []
    if not text:
        return []
    if path.suffix.lower() == ".json":
        payload = json.loads(text)
        rows = payload if isinstance(payload, list) else payload.get("items", [])
    elif path.suffix.lower() in {".jsonl", ".jl"}:
        rows = [json.loads(line) for line in text.splitlines() if line.strip()]
    else:
        with path.open("r", encoding="utf-8-sig", newline="") as fh:
            rows = list(csv.DictReader(fh))

    candidates: List[SearchCandidate] = []
    for row in rows:
        university_id = normalize_text(row.get("universityId") or row.get("university_id"))
        university_name = normalize_text(row.get("universityName") or row.get("university_name") or row.get("name"))
        target = targets.get(university_id) or targets.get(university_name)
        if not target:
            continue
        url = normalize_text(row.get("url") or row.get("sourceUrl") or row.get("source_url"))
        if not url:
            continue
        candidates.append(
            SearchCandidate(
                university_id=target.id,
                university_name=target.name,
                url=url,
                title=normalize_text(row.get("title")),
                snippet=normalize_text(row.get("snippet")),
                query=normalize_text(row.get("query")),
                source=normalize_text(row.get("source")) or "file",
            )
        )
    return candidates


def discover_candidates(
    targets: List[UniversityTarget],
    years: List[int],
    per_query: int,
    max_queries_per_school: int,
    timeout: int,
    candidates_file: Optional[Path],
    search_provider: str,
    search_gl: str,
    search_hl: str,
    search_country: str,
    search_lang: str,
    site_discovery_mode: str,
) -> List[SearchCandidate]:
    target_map: Dict[str, UniversityTarget] = {}
    for target in targets:
        target_map[target.id] = target
        target_map[target.name] = target

    candidates: List[SearchCandidate] = []
    if candidates_file:
        candidates.extend(load_candidates_file(candidates_file, target_map))

    provider, api_key = resolve_search_provider(search_provider)
    if not provider or not api_key:
        return dedupe_candidates(candidates)

    for target in targets:
        if provider == "site":
            candidates.extend(
                discover_site_candidates(
                    target,
                    years,
                    per_query,
                    max_queries_per_school,
                    timeout,
                    site_discovery_mode,
                )
            )
            continue
        for query in build_queries(target, years)[:max_queries_per_school]:
            for result in run_search_provider(
                provider,
                query,
                api_key,
                per_query,
                timeout,
                search_gl,
                search_hl,
                search_country,
                search_lang,
            ):
                candidates.append(
                    SearchCandidate(
                        university_id=target.id,
                        university_name=target.name,
                        url=result["url"],
                        title=result["title"],
                        snippet=result["snippet"],
                        query=query,
                        source=provider,
                    )
                )
            time.sleep(0.2)
    return dedupe_candidates(candidates)


def candidate_to_record(candidate: SearchCandidate) -> Dict[str, str]:
    return {
        "universityId": candidate.university_id,
        "universityName": candidate.university_name,
        "url": candidate.url,
        "title": candidate.title,
        "snippet": candidate.snippet,
        "query": candidate.query,
        "source": candidate.source,
    }


def write_candidates(path: Path, candidates: List[SearchCandidate]) -> None:
    records = [candidate_to_record(candidate) for candidate in candidates]
    if path.suffix.lower() == ".json":
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
        return
    write_jsonl(path, records)


def dedupe_candidates(candidates: Iterable[SearchCandidate]) -> List[SearchCandidate]:
    seen = set()
    deduped = []
    for item in candidates:
        key = (item.university_id, item.url.split("#", 1)[0])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def candidate_passes_prefilter(candidate: SearchCandidate, target: UniversityTarget) -> bool:
    if not candidate.url.startswith(("http://", "https://")):
        return False
    if is_blocked_candidate_url(candidate.url):
        return False
    if not is_probably_html_url(candidate.url):
        return False
    merged = f"{candidate.title} {candidate.snippet} {candidate.url}"
    if has_negative_signal(merged):
        return False
    if has_positive_signal(merged):
        return True
    candidate_host = get_registrable_host(get_host(candidate.url))
    target_hosts = {
        get_registrable_host(get_host(target.website)),
        get_registrable_host(get_host(target.grad_website)),
    }
    return bool(candidate_host and candidate_host in target_hosts)


def fetch_html_response(candidate: SearchCandidate, target: UniversityTarget, timeout: int) -> Optional[HtmlResponse]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
        )
    }
    resp = requests.get(candidate.url, headers=headers, timeout=timeout)
    resp.raise_for_status()
    content_type = (resp.headers.get("content-type") or "").split(";", 1)[0].lower()
    if content_type not in HTML_CONTENT_TYPES:
        return None
    if looks_like_waf_challenge(resp.text):
        raise RuntimeError("waf_challenge: site returned anti-bot JavaScript instead of article HTML")
    encoding = choose_response_encoding(resp)
    request = Request(
        url=resp.url,
        meta={
            "university": {
                "id": target.id,
                "name": target.name,
                "priority": target.priority,
                "website": target.website,
                "grad_website": target.grad_website,
                "entry_points": [target.grad_website or target.website],
                "strict_entry_points": False,
            },
            "title": candidate.title,
            "announcement_type": None,
        },
    )
    return HtmlResponse(url=resp.url, body=resp.content, encoding=encoding, request=request)


def looks_like_waf_challenge(html: str) -> bool:
    text = html or ""
    if len(text) > 20000:
        return False
    challenge_markers = ["window['$_ts']", "$_ts.cd", "LSqjcXQnxw3y", "_$gn();"]
    if not any(marker in text for marker in challenge_markers):
        return False
    body_text = normalize_text(re.sub(r"<script\b[^>]*>.*?</script>", " ", text, flags=re.I | re.S))
    body_text = normalize_text(re.sub(r"<[^>]+>", " ", body_text))
    return len(body_text) < 80


def extract_item(
    spider: UniversitySpider,
    candidate: SearchCandidate,
    target: UniversityTarget,
    response: HtmlResponse,
    timeout: int,
    max_content_chars: int,
) -> tuple[Optional[Dict[str, Any]], str]:
    page_title = spider.extract_page_title(response)
    content = spider.extract_content(response)
    if len(normalize_text(content)) < MIN_EMIT_CONTENT_CHARS:
        attachment_texts = extract_attachment_texts(response, timeout)
        if attachment_texts:
            content = normalize_text("\n".join([content, *attachment_texts]))
    camp_info = spider.extract_with_ai(response, page_title, content, {"id": target.id, "name": target.name})
    title = choose_title(spider, page_title, candidate.title, camp_info.get("title", ""))
    candidate_signal = f"{candidate.title} {candidate.snippet} {title}"
    if len(content or "") < 80:
        if not has_positive_signal(candidate_signal):
            return None, "content_too_short"
        content = normalize_text(
            "\n".join(
                [
                    candidate.title,
                    candidate.snippet,
                    f"来源：{response.url}",
                ]
            )
        )
    if len(normalize_text(content)) < MIN_EMIT_CONTENT_CHARS:
        return None, "content_too_short"
    keep, _reason = spider.should_keep_detail(response.url, title, content)
    if not keep and (not has_positive_signal(candidate_signal) or has_hard_negative_signal(candidate_signal, response.url)):
        return None, _reason or "filtered_by_detail_rules"
    if not spider.is_within_target_year(camp_info, content, response):
        return None, "year_out_of_range"
    hinted_type = infer_announcement_type_from_search_hint(candidate.title, candidate.snippet, title)
    detected_type = spider.detect_announcement_type(f"{candidate.title} {title}", response.url, content)
    announcement_type = (
        hinted_type
        or (detected_type if detected_type == "pre_recommendation" else None)
        or camp_info.get("announcement_type")
        or detected_type
        or "summer_camp"
    )
    content = content[:max(200, int(max_content_chars or 200))]
    return {
        "title": title,
        "announcementType": announcement_type,
        "universityId": target.id,
        "sourceUrl": response.url,
        "publishDate": camp_info.get("publish_date"),
        "deadline": camp_info.get("deadline"),
        "startDate": camp_info.get("start_date"),
        "endDate": camp_info.get("end_date"),
        "location": camp_info.get("location"),
        "requirements": camp_info.get("requirements") or {},
        "materials": camp_info.get("materials") or [],
        "process": camp_info.get("process") or [],
        "contact": camp_info.get("contact") or {},
        "content": content,
        "confidence": 0.68,
        "crawlTime": datetime.utcnow().isoformat(),
        "spiderName": "search_discovery_mvp",
    }, "emitted"


def merge_ingest_summaries(summaries: List[Dict[str, Any]]) -> Dict[str, Any]:
    numeric_keys = [
        "processed",
        "created",
        "updated",
        "unchanged",
        "skipped",
        "eventsCreated",
        "llmTriggered",
        "llmCompared",
        "llmMerged",
        "llmSuccess",
        "llmFailed",
    ]
    merged: Dict[str, Any] = {key: 0 for key in numeric_keys}
    merged["errors"] = []
    merged["batches"] = len(summaries)
    for summary in summaries:
        for key in numeric_keys:
            merged[key] += int(summary.get(key) or 0)
        merged["errors"].extend(summary.get("errors") or [])
    return merged


def ingest_batch(backend_base_url: str, ingest_key: str, items: List[Dict[str, Any]], timeout: int) -> Dict[str, Any]:
    resp = requests.post(
        f"{backend_base_url.rstrip('/')}/api/v1/crawler/ingest-camps",
        headers={"X-Crawler-Ingest-Key": ingest_key},
        json={"items": items, "emitBaselineEvents": True},
        timeout=timeout,
    )
    resp.raise_for_status()
    return resp.json()


def ingest_items(
    backend_base_url: str,
    ingest_key: str,
    items: List[Dict[str, Any]],
    timeout: int,
    batch_size: int,
) -> Dict[str, Any]:
    batch_size = max(1, int(batch_size or 1))
    summaries = []
    for start in range(0, len(items), batch_size):
        summaries.append(ingest_batch(backend_base_url, ingest_key, items[start : start + batch_size], timeout))
    return merge_ingest_summaries(summaries)


def write_jsonl(path: Path, items: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for item in items:
            fh.write(json.dumps(item, ensure_ascii=False, separators=(",", ":")) + "\n")


def new_school_coverage(target: UniversityTarget) -> Dict[str, Any]:
    return {
        "universityId": target.id,
        "universityName": target.name,
        "priority": target.priority,
        "candidates": 0,
        "limitedOut": 0,
        "prefiltered": 0,
        "fetched": 0,
        "emitted": 0,
        "dropReasons": {},
        "droppedCandidates": [],
        "errors": [],
    }


def write_coverage_report(path: Path, rows: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix.lower() == ".json":
        path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
        return

    total = {
        "schools": len(rows),
        "candidates": sum(int(row.get("candidates") or 0) for row in rows),
        "fetched": sum(int(row.get("fetched") or 0) for row in rows),
        "emitted": sum(int(row.get("emitted") or 0) for row in rows),
        "errors": sum(len(row.get("errors") or []) for row in rows),
    }
    lines = [
        "# Search Discovery Coverage",
        "",
        f"- schools: {total['schools']}",
        f"- candidates: {total['candidates']}",
        f"- fetched: {total['fetched']}",
        f"- emitted: {total['emitted']}",
        f"- errors: {total['errors']}",
        "",
        "| priority | university | candidates | fetched | emitted | prefiltered | limitedOut | dropReasons | errors |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |",
    ]
    for row in rows:
        drop_reasons = ";".join(
            f"{key}:{value}" for key, value in sorted((row.get("dropReasons") or {}).items())
        ) or "-"
        lines.append(
            "| {priority} | {name} | {candidates} | {fetched} | {emitted} | {prefiltered} | {limited} | {drops} | {errors} |".format(
                priority=row.get("priority") or "",
                name=row.get("universityName") or row.get("universityId") or "",
                candidates=row.get("candidates") or 0,
                fetched=row.get("fetched") or 0,
                emitted=row.get("emitted") or 0,
                prefiltered=row.get("prefiltered") or 0,
                limited=row.get("limitedOut") or 0,
                drops=drop_reasons,
                errors=len(row.get("errors") or []),
            )
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Search-first MVP discovery for baoyan announcements.")
    parser.add_argument("--backend-base-url", default=os.getenv("BACKEND_BASE_URL", "http://127.0.0.1:3000"))
    parser.add_argument("--priority", default="P0,P1", help="Comma-separated priorities, default P0,P1.")
    parser.add_argument("--university-id", default="", help="Comma-separated backend university ids or names.")
    parser.add_argument("--year-span", type=int, default=2)
    parser.add_argument("--limit-schools", type=int, default=0)
    parser.add_argument("--per-query", type=int, default=5)
    parser.add_argument("--max-queries-per-school", type=int, default=8)
    parser.add_argument("--max-candidates-per-school", type=int, default=60)
    parser.add_argument("--request-timeout", type=int, default=20)
    parser.add_argument("--search-provider", default="auto", choices=["auto", "site", "serpapi", "serper", "brave", "bing"])
    parser.add_argument("--search-gl", default="cn", help="Serper Google country code, default cn.")
    parser.add_argument("--search-hl", default="zh-cn", help="Serper Google UI language, default zh-cn.")
    parser.add_argument("--search-country", default="cn", help="Brave country code, default cn.")
    parser.add_argument("--search-lang", default="zh", help="Brave search language, default zh.")
    parser.add_argument(
        "--site-discovery-mode",
        default="full",
        choices=["full", "entry"],
        help="Site provider mode: entry only checks configured roots; full also tries sitemaps and site-search URLs.",
    )
    parser.add_argument("--candidates-file", type=Path)
    parser.add_argument("--candidates-output", type=Path, default=ROOT / "logs" / "search_discovery_candidates.jsonl")
    parser.add_argument("--candidates-only", action="store_true", help="Only discover/write candidates, do not fetch detail pages.")
    parser.add_argument("--max-content-chars", type=int, default=12000)
    parser.add_argument("--output", type=Path, default=ROOT / "logs" / "search_discovery_items.jl")
    parser.add_argument("--summary", type=Path, default=ROOT / "logs" / "search_discovery_summary.json")
    parser.add_argument("--coverage-output", type=Path, default=ROOT / "logs" / "search_discovery_coverage.md")
    parser.add_argument("--queries-output", type=Path, default=ROOT / "logs" / "search_discovery_queries.json")
    parser.add_argument("--no-local-fallback", action="store_true", help="Fail if backend university loading is unavailable.")
    parser.add_argument("--queries-only", action="store_true", help="Only write generated search queries, do not search/fetch.")
    parser.add_argument("--ingest", action="store_true")
    parser.add_argument("--ingest-key", default=os.getenv("CRAWLER_INGEST_KEY", ""))
    parser.add_argument("--ingest-batch-size", type=int, default=5)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    priorities = {item.strip() for item in args.priority.split(",") if item.strip()}
    university_ids = {item.strip() for item in args.university_id.split(",") if item.strip()}
    current_year = datetime.now().year
    years = [current_year - i for i in range(max(1, min(args.year_span, 5)))]

    targets = load_university_targets(
        args.backend_base_url,
        priorities,
        university_ids,
        args.request_timeout,
        allow_local_fallback=not args.no_local_fallback,
    )
    if args.limit_schools > 0:
        targets = targets[: args.limit_schools]
    if not targets:
        raise SystemExit("No university targets loaded. Start backend or provide matching filters.")

    write_queries(args.queries_output, targets, years, args.max_queries_per_school)
    if args.queries_only:
        print(
            json.dumps(
                {
                    "queriesOutput": str(args.queries_output),
                    "targets": len(targets),
                    "years": years,
                },
                ensure_ascii=False,
            )
        )
        return 0

    candidates = discover_candidates(
        targets,
        years,
        args.per_query,
        args.max_queries_per_school,
        args.request_timeout,
        args.candidates_file,
        args.search_provider,
        args.search_gl,
        args.search_hl,
        args.search_country,
        args.search_lang,
        args.site_discovery_mode,
    )
    write_candidates(args.candidates_output, candidates)
    if args.candidates_only:
        coverage_by_id = {target.id: new_school_coverage(target) for target in targets}
        for candidate in candidates:
            coverage = coverage_by_id.get(candidate.university_id)
            if coverage:
                coverage["candidates"] += 1
        write_coverage_report(args.coverage_output, list(coverage_by_id.values()))
        args.summary.write_text(
            json.dumps(
                {
                    "targets": len(targets),
                    "candidateCount": len(candidates),
                    "candidatesOutput": str(args.candidates_output),
                    "coverageOutput": str(args.coverage_output),
                    "zeroCandidateSchools": [
                        row["universityName"]
                        for row in coverage_by_id.values()
                        if int(row.get("candidates") or 0) == 0
                    ],
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        print(
            json.dumps(
                {
                    "candidatesOutput": str(args.candidates_output),
                    "coverageOutput": str(args.coverage_output),
                    "summary": str(args.summary),
                    "candidateCount": len(candidates),
                    "targets": len(targets),
                    "years": years,
                },
                ensure_ascii=False,
            )
        )
        return 0
    target_by_id = {target.id: target for target in targets}
    coverage_by_id = {target.id: new_school_coverage(target) for target in targets}
    per_school_seen: Dict[str, int] = {}
    spider = UniversitySpider()
    spider.target_years = years
    items: List[Dict[str, Any]] = []
    stats = {
        "targets": len(targets),
        "candidateCount": len(candidates),
        "prefiltered": 0,
        "fetched": 0,
        "emitted": 0,
        "dropReasons": {},
        "droppedCandidates": [],
        "errors": [],
    }

    for candidate in candidates:
        target = target_by_id.get(candidate.university_id)
        if not target:
            continue
        school_coverage = coverage_by_id[target.id]
        school_coverage["candidates"] += 1
        count = per_school_seen.get(target.id, 0)
        if count >= args.max_candidates_per_school:
            school_coverage["limitedOut"] += 1
            continue
        per_school_seen[target.id] = count + 1
        if not candidate_passes_prefilter(candidate, target):
            stats["prefiltered"] += 1
            school_coverage["prefiltered"] += 1
            continue
        try:
            response = fetch_html_response(candidate, target, args.request_timeout)
            if response is None:
                stats["prefiltered"] += 1
                school_coverage["prefiltered"] += 1
                continue
            stats["fetched"] += 1
            school_coverage["fetched"] += 1
            item, reason = extract_item(spider, candidate, target, response, args.request_timeout, args.max_content_chars)
            if item:
                items.append(item)
                stats["emitted"] += 1
                school_coverage["emitted"] += 1
            else:
                stats["dropReasons"][reason] = stats["dropReasons"].get(reason, 0) + 1
                school_coverage["dropReasons"][reason] = school_coverage["dropReasons"].get(reason, 0) + 1
                dropped_candidate = {
                    "universityId": candidate.university_id,
                    "url": candidate.url,
                    "title": candidate.title,
                    "reason": reason,
                }
                stats["droppedCandidates"].append(dropped_candidate)
                school_coverage["droppedCandidates"].append(dropped_candidate)
        except Exception as exc:
            error = {
                "universityId": candidate.university_id,
                "url": candidate.url,
                "reason": str(exc)[:300],
            }
            stats["errors"].append(error)
            school_coverage["errors"].append(error)

    write_jsonl(args.output, items)
    coverage_rows = list(coverage_by_id.values())
    write_coverage_report(args.coverage_output, coverage_rows)
    ingest_summary = None
    if args.ingest:
        if not args.ingest_key:
            raise SystemExit("--ingest requires --ingest-key or CRAWLER_INGEST_KEY")
        ingest_summary = ingest_items(
            args.backend_base_url,
            args.ingest_key,
            items,
            args.request_timeout,
            args.ingest_batch_size,
        )

    args.summary.parent.mkdir(parents=True, exist_ok=True)
    args.summary.write_text(
        json.dumps(
            {
                "startedAt": datetime.utcnow().isoformat(),
                "priorities": sorted(priorities),
                "years": years,
                "output": str(args.output),
                "candidatesOutput": str(args.candidates_output),
                "coverageOutput": str(args.coverage_output),
                "stats": stats,
                "coverage": coverage_rows,
                "ingest": ingest_summary,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "output": str(args.output),
                "candidatesOutput": str(args.candidates_output),
                "summary": str(args.summary),
                "coverageOutput": str(args.coverage_output),
                "stats": stats,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

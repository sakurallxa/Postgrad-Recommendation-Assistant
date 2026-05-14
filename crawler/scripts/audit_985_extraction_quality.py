#!/usr/bin/env python3
"""Audit crawler output quality for 985 launch readiness.

The report is intentionally file-based so it can run before data is ingested
into the backend. It checks both school-level coverage and item-level extraction
quality, especially navigation/目录污染 and partial正文 extraction.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


OFFICIAL_985_NAMES = [
    "北京大学",
    "清华大学",
    "中国人民大学",
    "北京航空航天大学",
    "北京理工大学",
    "中国农业大学",
    "北京师范大学",
    "中央民族大学",
    "南开大学",
    "天津大学",
    "大连理工大学",
    "东北大学",
    "吉林大学",
    "哈尔滨工业大学",
    "复旦大学",
    "同济大学",
    "上海交通大学",
    "华东师范大学",
    "南京大学",
    "东南大学",
    "浙江大学",
    "中国科学技术大学",
    "厦门大学",
    "山东大学",
    "中国海洋大学",
    "武汉大学",
    "华中科技大学",
    "湖南大学",
    "中南大学",
    "中山大学",
    "华南理工大学",
    "四川大学",
    "重庆大学",
    "电子科技大学",
    "西安交通大学",
    "西北工业大学",
    "西北农林科技大学",
    "兰州大学",
    "国防科技大学",
]

NAV_PREFIX_RE = re.compile(
    r"^(首页|招考信息|招生简章|网上报名|信息公示|招考政策|选择身份|信息系统登录|"
    r"博士招生|硕士招生|港澳台招生|通知公告|招生信息|研究生招生|网站首页)"
)
NAV_DENSE_RE = re.compile(
    r"(首页.{0,20}招考信息.{0,40}招生简章|网上报名.{0,20}信息公示|"
    r"博士招生.{0,20}硕士招生.{0,20}港澳台)"
)
TITLE_NOISE_RE = re.compile(r"(发布时间|发布日期|点击数|浏览次数|分享至|当前位置|您当前的位置)")
ATTACHMENT_ONLY_RE = re.compile(r"^(附件|附件\d+|.*\.(pdf|doc|docx|xls|xlsx))", re.I)
SYSTEM_RE = re.compile(r"(登录|default\.aspx|/login|/zsxt|/zsgl|download\.jsp|dd_article_attachment)", re.I)
POSITIVE_RE = re.compile(r"(夏令营|优秀大学生|推免|推荐免试|免试攻读|预推免|预报名|直博)")
STRUCTURE_RE = re.compile(
    r"(申请条件|报名条件|申请资格|报名资格|申请材料|报名材料|申请流程|报名流程|"
    r"申请程序|选拔流程|联系方式|联系人|截止时间|报名时间|活动时间|举办时间)"
)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def normalize(text: Any) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def host_of(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except Exception:
        return ""


def build_school_catalog(overrides_path: Path) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    overrides = read_json(overrides_path) if overrides_path.exists() else []
    by_name = {str(row.get("name") or ""): row for row in overrides if row.get("name")}
    by_slug = {str(row.get("slug") or ""): row for row in overrides if row.get("slug")}
    return by_name, by_slug


def item_quality_issues(row: dict[str, Any]) -> list[str]:
    title = normalize(row.get("title"))
    content = normalize(row.get("content") or row.get("description"))
    url = str(row.get("sourceUrl") or "")
    issues = []

    if len(content) < 300:
        issues.append("content_too_short")
    if NAV_PREFIX_RE.search(content[:120]) or NAV_DENSE_RE.search(content[:500]):
        issues.append("navigation_pollution")
    if TITLE_NOISE_RE.search(title):
        issues.append("title_noise")
    if (
        ATTACHMENT_ONLY_RE.search(content[:120])
        and "PDF正文" not in content[:120]
        and len(content) < 800
    ):
        issues.append("attachment_or_filename_only")
    if SYSTEM_RE.search(url) or SYSTEM_RE.search(title):
        issues.append("system_or_download_url")
    if not POSITIVE_RE.search(title + " " + content[:800]):
        issues.append("missing_positive_signal")
    if len(content) >= 300 and not STRUCTURE_RE.search(content):
        issues.append("weak_structured_body")
    if not row.get("deadline"):
        issues.append("deadline_missing")
    return issues


def summarize_item(row: dict[str, Any], issues: list[str]) -> dict[str, Any]:
    content = normalize(row.get("content") or row.get("description"))
    return {
        "title": row.get("title") or "",
        "url": row.get("sourceUrl") or "",
        "host": host_of(row.get("sourceUrl") or ""),
        "announcementType": row.get("announcementType") or "",
        "deadline": row.get("deadline") or "",
        "contentLength": len(content),
        "issues": issues,
        "contentStart": content[:180],
    }


def school_status(row: dict[str, Any]) -> str:
    if row["blockingIssueCount"] > 0:
        return "BLOCKED"
    if row["emitted"] == 0:
        return "NO_OUTPUT"
    if row["candidateCount"] == 0:
        return "NO_CANDIDATE"
    if row["qualityIssueCount"] > 0:
        return "WARN"
    return "OK"


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# 985 Crawler Launch QA",
        "",
        f"- generatedAt: {report['generatedAt']}",
        f"- schools: {report['summary']['schools']}",
        f"- ok: {report['summary']['ok']}",
        f"- warn: {report['summary']['warn']}",
        f"- blocked/no output/no candidate: {report['summary']['blocked']}",
        f"- emitted: {report['summary']['emitted']}",
        f"- candidates: {report['summary']['candidates']}",
        "",
        "## School Status",
        "",
        "| status | university | candidates | emitted | badItems | issues | nextAction |",
        "| --- | --- | ---: | ---: | ---: | --- | --- |",
    ]
    for row in report["schools"]:
        issue_text = ", ".join(f"{k}:{v}" for k, v in row["issueCounts"].items()) or "-"
        lines.append(
            f"| {row['status']} | {row['universityName']} | {row['candidateCount']} | "
            f"{row['emitted']} | {row['blockingIssueCount']} | {issue_text} | {row['nextAction']} |"
        )

    lines.extend(["", "## Blocking Items", ""])
    for item in report["blockingItems"][:80]:
        lines.extend(
            [
                f"### {item['universityName']} - {item['title']}",
                f"- url: {item['url']}",
                f"- issues: {', '.join(item['issues'])}",
                f"- contentLength: {item['contentLength']}",
                f"- contentStart: {item['contentStart']}",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit 985 crawler extraction quality.")
    parser.add_argument("--items", default="logs/search_discovery_site_985_items_current.jl")
    parser.add_argument("--candidates", default="logs/search_discovery_site_985_candidates_current.jsonl")
    parser.add_argument("--summary", default="logs/search_discovery_site_985_items_current_summary.json")
    parser.add_argument("--overrides", default="../shared/crawl-overrides.json")
    parser.add_argument("--output-json", default="logs/qa_985_launch_report.json")
    parser.add_argument("--output-md", default="logs/qa_985_launch_report.md")
    args = parser.parse_args()

    items_path = Path(args.items)
    candidates_path = Path(args.candidates)
    summary_path = Path(args.summary)
    overrides_path = Path(args.overrides)
    output_json = Path(args.output_json)
    output_md = Path(args.output_md)

    items = read_jsonl(items_path)
    candidates = read_jsonl(candidates_path)
    crawl_summary = read_json(summary_path) if summary_path.exists() else {}
    override_by_name, override_by_slug = build_school_catalog(overrides_path)

    candidates_by_school: dict[str, list[dict[str, Any]]] = defaultdict(list)
    items_by_school: dict[str, list[dict[str, Any]]] = defaultdict(list)
    school_name_by_id: dict[str, str] = {}
    for row in candidates:
        school_id = str(row.get("universityId") or "")
        candidates_by_school[school_id].append(row)
        if row.get("universityName"):
            school_name_by_id[school_id] = str(row["universityName"])
    for row in items:
        school_id = str(row.get("universityId") or "")
        items_by_school[school_id].append(row)

    rows = []
    blocking_items = []
    for name in OFFICIAL_985_NAMES:
        override = override_by_name.get(name, {})
        slug = str(override.get("slug") or "")
        school_id = slug
        school_candidates = candidates_by_school.get(school_id, [])
        school_items = items_by_school.get(school_id, [])
        issue_counts: Counter[str] = Counter()
        quality_items = []
        blocking_count = 0
        for item in school_items:
            issues = item_quality_issues(item)
            if issues:
                issue_counts.update(issues)
                quality_items.append(summarize_item(item, issues))
            blocking = [i for i in issues if i not in {"deadline_missing", "weak_structured_body"}]
            if blocking:
                blocking_count += 1
                blocking_items.append(
                    {
                        "universityName": name,
                        **summarize_item(item, blocking),
                    }
                )

        entry_points = override.get("entryPoints") or override.get("entry_points") or []
        row = {
            "universityName": name,
            "universityId": school_id,
            "priority": override.get("priority") or "",
            "entryPointCount": len(entry_points),
            "candidateCount": len(school_candidates),
            "emitted": len(school_items),
            "qualityIssueCount": sum(issue_counts.values()),
            "blockingIssueCount": blocking_count,
            "issueCounts": dict(issue_counts.most_common()),
            "hosts": sorted({host_of(c.get("url") or "") for c in school_candidates if c.get("url")}),
            "sampleIssues": quality_items[:5],
        }
        if row["candidateCount"] == 0:
            row["nextAction"] = "补入口/站点发现"
        elif row["emitted"] == 0:
            row["nextAction"] = "检查 block/正文选择/访问错误"
        elif row["blockingIssueCount"] > 0:
            top = next(iter(row["issueCounts"]), "")
            if top == "navigation_pollution":
                row["nextAction"] = "加 contentSelectors"
            elif top == "title_noise":
                row["nextAction"] = "加 titleSelectors/标题清洗"
            elif top == "content_too_short":
                row["nextAction"] = "补正文选择/附件解析/兜底入口"
            elif top == "system_or_download_url":
                row["nextAction"] = "加 blockPatterns"
            else:
                row["nextAction"] = "人工查看样例"
        elif row["qualityIssueCount"] > 0:
            row["nextAction"] = "低风险字段增强"
        else:
            row["nextAction"] = "可上线"
        row["status"] = school_status(row)
        rows.append(row)

    status_counts = Counter(row["status"] for row in rows)
    report = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "input": {
            "items": str(items_path),
            "candidates": str(candidates_path),
            "summary": str(summary_path),
            "crawlStats": crawl_summary.get("stats", {}),
        },
        "summary": {
            "schools": len(rows),
            "ok": status_counts.get("OK", 0),
            "warn": status_counts.get("WARN", 0),
            "blocked": status_counts.get("BLOCKED", 0)
            + status_counts.get("NO_OUTPUT", 0)
            + status_counts.get("NO_CANDIDATE", 0),
            "statusCounts": dict(status_counts),
            "candidates": sum(row["candidateCount"] for row in rows),
            "emitted": sum(row["emitted"] for row in rows),
            "blockingItems": len(blocking_items),
        },
        "schools": rows,
        "blockingItems": blocking_items,
    }

    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    output_md.write_text(render_markdown(report), encoding="utf-8")
    print(json.dumps({"json": str(output_json), "md": str(output_md), "summary": report["summary"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()

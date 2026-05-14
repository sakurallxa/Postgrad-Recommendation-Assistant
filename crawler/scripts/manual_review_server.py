#!/usr/bin/env python3
"""
Temporary manual review console for crawler discovery gaps.

The server reads crawler candidate/item/summary files, builds a review queue,
and appends reviewer decisions to a JSONL file. It is intentionally local and
small so we can review blocked schools before a real admin backend exists.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import urllib.request
import urllib.error
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Iterable, List
from urllib.parse import parse_qs, urlparse


# β场景运营干预：复核台直连后端 admin 接口
BACKEND_BASE_URL = os.environ.get("BACKEND_BASE_URL", "http://127.0.0.1:3000")
CRAWLER_ADMIN_KEY = os.environ.get("CRAWLER_ADMIN_KEY", "")


def call_backend(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    """调用后端 admin API。返回 (status_code, json_body)"""
    url = f"{BACKEND_BASE_URL.rstrip('/')}{path}"
    data = json.dumps(body or {}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data if method.upper() != "GET" else None,
        method=method.upper(),
        headers={
            "Content-Type": "application/json",
            "X-Admin-Key": CRAWLER_ADMIN_KEY,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode("utf-8") or "{}")
        except Exception:
            err_body = {"error": e.reason}
        return e.code, err_body
    except Exception as e:
        return 502, {"error": str(e)}


ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ROOT.parent
DEFAULT_SUMMARY = ROOT / "logs" / "search_discovery_site_985_items_current_summary.json"
DEFAULT_CANDIDATES = ROOT / "logs" / "search_discovery_site_985_candidates_current.jsonl"
DEFAULT_ITEMS = ROOT / "logs" / "search_discovery_site_985_items_current.jl"
DEFAULT_DECISIONS = ROOT / "logs" / "manual_review_decisions.jsonl"


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def write_jsonl_append(path: Path, row: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def stable_id(*parts: str) -> str:
    raw = "\n".join(part or "" for part in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def index_latest_decisions(rows: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    decisions: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        item_id = str(row.get("id") or "")
        if item_id:
            decisions[item_id] = row
    return decisions


def school_name_by_id(summary: Dict[str, Any]) -> Dict[str, str]:
    names = {}
    for row in summary.get("coverage") or []:
        if row.get("universityId"):
            names[row["universityId"]] = row.get("universityName") or row["universityId"]
    return names


def build_queue(
    summary_path: Path,
    candidates_path: Path,
    items_path: Path,
    decisions_path: Path,
) -> Dict[str, Any]:
    summary = read_json(summary_path, {})
    candidates = read_jsonl(candidates_path)
    items = read_jsonl(items_path)
    decisions = index_latest_decisions(read_jsonl(decisions_path))
    emitted_urls = {row.get("sourceUrl") for row in items if row.get("sourceUrl")}
    names_by_id = school_name_by_id(summary)
    errors_by_url = {}
    dropped_by_url = {}
    drops_by_school = {}

    for coverage in summary.get("coverage") or []:
        drops_by_school[coverage.get("universityId")] = coverage.get("dropReasons") or {}
        for dropped in coverage.get("droppedCandidates") or []:
            if dropped.get("url"):
                dropped_by_url[dropped["url"]] = dropped
        for error in coverage.get("errors") or []:
            if error.get("url"):
                errors_by_url[error["url"]] = error

    queue: List[Dict[str, Any]] = []

    for coverage in summary.get("coverage") or []:
        if int(coverage.get("emitted") or 0) > 0:
            continue
        school_id = coverage.get("universityId") or ""
        school_name = coverage.get("universityName") or school_id
        if int(coverage.get("candidates") or 0) == 0:
            item = {
                "id": stable_id("no_candidate", school_id, school_name),
                "type": "no_candidate",
                "priority": coverage.get("priority") or "",
                "universityId": school_id,
                "universityName": school_name,
                "title": "No official candidate URL discovered",
                "url": "",
                "reason": "候选发现为 0，需要人工查找官方入口或确认该校官网不可达。",
                "severity": "high",
            }
            item["decision"] = decisions.get(item["id"])
            queue.append(item)

    for candidate in candidates:
        url = candidate.get("url") or ""
        school_id = candidate.get("universityId") or ""
        if url in emitted_urls:
            continue
        error = errors_by_url.get(url)
        dropped = dropped_by_url.get(url)
        drops = drops_by_school.get(school_id) or {}
        if error:
            review_type = "fetch_error"
            reason = error.get("reason") or "fetch_error"
            severity = "high"
        elif dropped:
            review_type = "dropped_candidate"
            reason = dropped.get("reason") or "dropped_candidate"
            severity = "medium"
        elif drops:
            review_type = "dropped_candidate"
            reason = ", ".join(f"{key}:{value}" for key, value in drops.items())
            severity = "medium"
        else:
            review_type = "not_emitted"
            reason = "候选未出现在解析产物中，可能被过滤或超过单校候选上限。"
            severity = "medium"
        item = {
            "id": stable_id(review_type, school_id, url, candidate.get("title") or ""),
            "type": review_type,
            "priority": candidate.get("priority") or "",
            "universityId": school_id,
            "universityName": candidate.get("universityName") or names_by_id.get(school_id) or school_id,
            "title": candidate.get("title") or "",
            "url": url,
            "reason": reason,
            "severity": severity,
            "source": candidate.get("source") or "",
            "snippet": candidate.get("snippet") or "",
        }
        item["decision"] = decisions.get(item["id"])
        queue.append(item)

    for item_row in items:
        announcement_type = item_row.get("announcementType") or ""
        required_fields = ["deadline"]
        if announcement_type == "summer_camp":
            required_fields.extend(["startDate", "endDate"])

        missing = []
        for field in required_fields:
            if not item_row.get(field):
                missing.append(field)
        content = item_row.get("content") or ""
        if len(content) >= 500 and not missing:
            continue
        school_id = item_row.get("universityId") or ""
        item = {
            "id": stable_id("low_quality_item", school_id, item_row.get("sourceUrl") or "", item_row.get("title") or ""),
            "type": "low_quality_item",
            "priority": "",
            "universityId": school_id,
            "universityName": names_by_id.get(school_id) or school_id,
            "title": item_row.get("title") or "",
            "url": item_row.get("sourceUrl") or "",
            "reason": f"已解析但字段缺失: {', '.join(missing) or 'content_short'}; content_len={len(content)}",
            "severity": "low",
            "announcementType": announcement_type,
            "deadline": item_row.get("deadline") or "",
            "startDate": item_row.get("startDate") or "",
            "endDate": item_row.get("endDate") or "",
            "publishDate": item_row.get("publishDate") or "",
            "location": item_row.get("location") or "",
            "confidence": item_row.get("confidence"),
            "contentPreview": content[:500],
        }
        item["decision"] = decisions.get(item["id"])
        queue.append(item)

    order = {"high": 0, "medium": 1, "low": 2}
    queue.sort(key=lambda row: (order.get(row.get("severity"), 9), row.get("universityName") or "", row.get("type") or ""))

    return {
        "generatedAt": datetime.utcnow().isoformat(),
        "summaryPath": str(summary_path),
        "candidatesPath": str(candidates_path),
        "itemsPath": str(items_path),
        "decisionsPath": str(decisions_path),
        "stats": {
            "queue": len(queue),
            "decided": sum(1 for item in queue if item.get("decision")),
            "summary": summary.get("stats") or {},
        },
        "coverage": summary.get("coverage") or [],
        "items": queue,
    }


INDEX_HTML = r"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>保研公告抓取复核台</title>
  <style>
    :root { color-scheme: light; --border:#d8dee8; --text:#1f2937; --muted:#6b7280; --bg:#f7f8fb; --panel:#fff; --blue:#1d4ed8; --red:#b91c1c; --green:#047857; --amber:#92400e; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--text); background:var(--bg); }
    header { position:sticky; top:0; z-index:3; background:var(--panel); border-bottom:1px solid var(--border); padding:12px 18px; }
    h1 { margin:0; font-size:20px; }
    .topline { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
    .bar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    input, select, textarea { border:1px solid var(--border); border-radius:6px; padding:8px 10px; font:inherit; background:#fff; min-width:0; }
    input[type="search"] { width:min(360px, 100%); }
    textarea { width:100%; min-height:84px; resize:vertical; }
    button { border:1px solid var(--border); background:#fff; border-radius:6px; padding:8px 10px; cursor:pointer; font:inherit; }
    button.primary { background:var(--blue); color:#fff; border-color:var(--blue); }
    button.good { color:var(--green); border-color:#86efac; background:#f0fdf4; }
    button.bad { color:var(--red); border-color:#fecaca; background:#fff1f2; }
    button.mini { padding:4px 7px; font-size:12px; }
    main { display:grid; grid-template-columns: 300px minmax(420px, 38%) minmax(460px, 1fr); min-height:calc(100vh - 92px); }
    aside, section { overflow:auto; max-height:calc(100vh - 92px); }
    #schools { background:#fbfcff; border-right:1px solid var(--border); }
    #list { background:#fff; border-right:1px solid var(--border); }
    #detail { padding:16px; }
    .panel-title { display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border-bottom:1px solid var(--border); font-weight:650; }
    .school { padding:10px 14px; border-bottom:1px solid #edf0f5; cursor:pointer; }
    .school:hover, .school.active { background:#eef4ff; }
    .school-name { font-weight:650; }
    .item { padding:12px 14px; border-bottom:1px solid var(--border); cursor:pointer; }
    .item:hover, .item.active { background:#eef4ff; }
    .title { font-weight:650; line-height:1.35; }
    .meta { color:var(--muted); font-size:12px; margin-top:6px; display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
    .pill { display:inline-flex; align-items:center; border:1px solid var(--border); border-radius:999px; padding:2px 7px; background:#fff; white-space:nowrap; }
    .high { color:#991b1b; border-color:#fecaca; background:#fff1f2; }
    .medium { color:#92400e; border-color:#fde68a; background:#fffbeb; }
    .low { color:#1d4ed8; border-color:#bfdbfe; background:#eff6ff; }
    .accepted { color:#047857; border-color:#86efac; background:#f0fdf4; }
    .rejected { color:#991b1b; border-color:#fecaca; background:#fff1f2; }
    .needs { color:#92400e; border-color:#fde68a; background:#fffbeb; }
    .card { background:#fff; border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:12px; }
    .card h2 { font-size:16px; margin:0 0 10px; }
    .grid { display:grid; grid-template-columns: 150px 1fr; gap:9px 12px; }
    .label { color:var(--muted); }
    .help { color:#4b5563; background:#f3f4f6; border:1px solid #e5e7eb; border-radius:6px; padding:8px 10px; line-height:1.45; }
    .evidence { margin-top:8px; color:#374151; font-size:12px; line-height:1.45; }
    .url { word-break:break-all; }
    a { color:var(--blue); word-break:break-all; }
    .field { margin-bottom:12px; }
    .field label { display:block; font-weight:650; margin-bottom:5px; }
    .field small { color:var(--muted); display:block; margin-top:4px; line-height:1.35; }
    .checkbox-grid { display:grid; grid-template-columns: repeat(2, minmax(160px, 1fr)); gap:6px; }
    .check { display:flex; gap:6px; align-items:flex-start; border:1px solid #e5e7eb; border-radius:6px; padding:6px 8px; background:#fff; font-size:13px; }
    .check input { margin-top:2px; }
    .empty { color:var(--muted); padding:24px; }
    .summary { display:grid; grid-template-columns: repeat(4, minmax(92px, 1fr)); gap:8px; }
    .metric { border:1px solid #e5e7eb; border-radius:6px; padding:8px; background:#fbfcff; }
    .metric strong { display:block; font-size:18px; }
    @media (max-width: 1100px) { main { grid-template-columns:1fr; } aside, section { max-height:none; } }
  </style>
</head>
<body>
  <header>
    <div class="topline">
      <h1>保研公告抓取复核台</h1>
      <span id="stats" class="meta"></span>
    </div>
    <div class="bar">
      <input id="q" type="search" placeholder="搜索学校、标题、URL、原因、备注" />
      <select id="schoolFilter"><option value="">全部学校</option></select>
      <select id="type"><option value="">全部问题类型</option></select>
      <select id="state"><option value="">全部状态</option><option value="open">未处理</option><option value="done">已处理</option></select>
      <select id="severity"><option value="">全部严重度</option><option value="high">high 高</option><option value="medium">medium 中</option><option value="low">low 低</option></select>
      <button id="reload">刷新</button>
    </div>
  </header>
  <main>
    <aside id="schools"></aside>
    <aside id="list"></aside>
    <section id="detail"><div class="empty">选择左侧条目开始复核。</div></section>
  </main>
  <script>
    let payload = null;
    let selectedId = null;
    let selectedSchool = '';
    const $ = (id) => document.getElementById(id);

    const DICTS = {
      type: {
        no_candidate: '无候选：该校没发现可抓 URL',
        fetch_error: '抓取失败：URL 请求报错',
        dropped_candidate: '候选被丢弃：疑似被过滤',
        not_emitted: '未产出：候选未进入抽取结果',
        low_quality_item: '低质量产物：已抽取但字段缺失'
      },
      severity: { high:'高：阻塞覆盖或核心链路', medium:'中：影响召回或需规则判断', low:'低：字段质量抽检' },
      reviewDecision: {
        accept:'有效公告，可入库',
        reject:'候选错误，应过滤',
        fix_needed:'候选正确，但抽取/字段需修',
        entry_point:'有效入口，应作为入口继续展开',
        unsure:'不确定，留给后续人工判断'
      },
      targetType: {
        detail_page:'详情页：单条公告正文',
        list_page:'列表页：需要继续展开子链接',
        attachment:'附件：PDF/Word/Excel 等材料',
        login_system:'报名/登录系统，不是公告正文',
        school_home:'学校/学院首页或栏目页',
        irrelevant:'无关页面'
      },
      announcementType: {
        summer_camp:'夏令营',
        pre_recommendation:'推免/预推免',
        other:'其他招生公告',
        unknown:'未知'
      },
      officialness: {
        official:'校级官方',
        department_official:'院系官方',
        third_party:'第三方/转载',
        unknown:'未知'
      },
      problemTags: {
        title_wrong:'标题错误/标题不干净',
        content_too_short:'正文过短/没抓到正文',
        deadline_missing:'截止时间缺失',
        date_wrong:'日期提取错误',
        attachment_not_parsed:'附件未解析',
        list_not_expanded:'列表页未展开',
        login_page:'登录/报名系统页',
        duplicate:'重复公告',
        wrong_school:'学校归属错误',
        wrong_topic:'主题不相关',
        old_year:'年份过旧'
      },
      suggestedAction: {
        add_entry_point:'新增入口 entry point',
        add_allow_pattern:'新增允许规则 allow pattern',
        add_block_pattern:'新增屏蔽规则 block pattern',
        improve_date_extract:'增强日期/截止时间抽取',
        parse_attachment:'增强附件解析',
        increase_school_limit:'提高单校候选上限',
        mark_as_duplicate:'标记重复/去重'
      }
    };

    async function load() {
      payload = await fetch('/api/queue').then(r => r.json());
      fillSelect('type', unique(payload.items.map(x => x.type)), '全部问题类型', v => label('type', v));
      fillSelect('schoolFilter', unique(payload.coverage.map(x => x.universityId).filter(Boolean)), '全部学校', v => {
        const row = payload.coverage.find(x => x.universityId === v);
        return row ? `${row.universityName} (${v})` : v;
      });
      render();
    }

    function fillSelect(id, values, first, formatter) {
      const current = $(id).value;
      $(id).innerHTML = `<option value="">${first}</option>` + values.map(v => `<option value="${escapeAttr(v)}">${escapeHtml(formatter(v))}</option>`).join('');
      if (values.includes(current)) $(id).value = current;
    }

    function filtered() {
      const q = $('q').value.trim().toLowerCase();
      const type = $('type').value;
      const state = $('state').value;
      const severity = $('severity').value;
      const school = selectedSchool || $('schoolFilter').value;
      return payload.items.filter(item => {
        const decision = item.decision || {};
        const hay = [item.universityName, item.universityId, item.title, item.url, item.reason, item.type, decision.note, decision.suggestedUrl].join(' ').toLowerCase();
        if (q && !hay.includes(q)) return false;
        if (type && item.type !== type) return false;
        if (severity && item.severity !== severity) return false;
        if (school && item.universityId !== school) return false;
        if (state === 'open' && item.decision) return false;
        if (state === 'done' && !item.decision) return false;
        return true;
      });
    }

    function render() {
      const rows = filtered();
      const summary = payload.stats.summary || {};
      $('stats').textContent = `队列 ${payload.stats.queue}，已处理 ${payload.stats.decided}，候选 ${summary.candidateCount || 0}，产物 ${summary.emitted || 0}，当前显示 ${rows.length}`;
      renderSchools();
      renderList(rows);
      if (selectedId) renderDetail(payload.items.find(x => x.id === selectedId));
    }

    function renderSchools() {
      const reviewCounts = {};
      payload.items.forEach(item => {
        reviewCounts[item.universityId] = reviewCounts[item.universityId] || { total:0, open:0 };
        reviewCounts[item.universityId].total += 1;
        if (!item.decision) reviewCounts[item.universityId].open += 1;
      });
      const rows = payload.coverage.slice().sort((a, b) => (reviewCounts[b.universityId]?.open || 0) - (reviewCounts[a.universityId]?.open || 0));
      $('schools').innerHTML = `
        <div class="panel-title"><span>学校覆盖</span><button class="mini" onclick="clearSchool()">全部</button></div>
        ${rows.map(row => {
          const counts = reviewCounts[row.universityId] || { total:0, open:0 };
          const ok = Number(row.emitted || 0) > 0;
          return `<div class="school ${selectedSchool === row.universityId ? 'active' : ''}" onclick="selectSchool('${escapeAttr(row.universityId || '')}')">
            <div class="school-name">${escapeHtml(row.universityName || row.universityId)}</div>
            <div class="meta">
              <span class="pill ${ok ? 'accepted' : 'high'}">${ok ? '有产物' : '无产物'}</span>
              <span class="pill">候选 ${row.candidates || 0}</span>
              <span class="pill">产物 ${row.emitted || 0}</span>
              <span class="pill">待复核 ${counts.open}</span>
            </div>
          </div>`;
        }).join('')}`;
    }

    function renderList(rows) {
      $('list').innerHTML = `
        <div class="panel-title"><span>问题队列</span><span class="meta">${rows.length} 条</span></div>
        ${rows.map(item => {
          const decision = item.decision;
          return `<div class="item ${item.id === selectedId ? 'active' : ''}" onclick="selectItem('${item.id}')">
            <div class="title">${escapeHtml(item.universityName)} · ${escapeHtml(item.title || item.type)}</div>
            <div class="meta">
              <span class="pill ${item.severity}">${escapeHtml(label('severity', item.severity))}</span>
              <span class="pill">${escapeHtml(label('type', item.type))}</span>
              ${decision ? `<span class="pill ${decisionClass(decision.reviewDecision || decision.decision)}">${escapeHtml(label('reviewDecision', decision.reviewDecision || decision.decision))}</span>` : '<span class="pill">未处理</span>'}
            </div>
            <div class="evidence">
              <div class="help">${escapeHtml(decisionHint(item))}</div>
              ${item.url ? `<div class="url">URL：<a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a></div>` : ''}
              <div>原因：${escapeHtml(item.reason || '')}</div>
              ${item.snippet ? `<div>候选片段：${escapeHtml(item.snippet)}</div>` : ''}
              ${item.contentPreview ? `<div>抽取正文预览：${escapeHtml(item.contentPreview.slice(0, 260))}${item.contentPreview.length > 260 ? '...' : ''}</div>` : ''}
            </div>
          </div>`;
        }).join('') || '<div class="empty">没有匹配条目。</div>'}`;
    }

    function renderDetail(item) {
      if (!item) {
        $('detail').innerHTML = '<div class="empty">条目不存在。</div>';
        return;
      }
      const d = item.decision || {};
      $('detail').innerHTML = `
        <div class="card">
          <h2>复核对象</h2>
          <div class="grid">
            <div class="label">学校</div><div>${escapeHtml(item.universityName)} (${escapeHtml(item.universityId)})</div>
            <div class="label">问题类型</div><div>${escapeHtml(item.type)} · ${escapeHtml(label('type', item.type))}</div>
            <div class="label">严重度</div><div>${escapeHtml(item.severity)} · ${escapeHtml(label('severity', item.severity))}</div>
            <div class="label">标题</div><div>${escapeHtml(item.title || '')}</div>
            <div class="label">URL</div><div>${item.url ? `<a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a>` : '无'}</div>
            <div class="label">抓取原因</div><div>${escapeHtml(item.reason || '')}</div>
            <div class="label">证据来源</div><div>${escapeHtml(evidenceSourceLabel(item))}</div>
          </div>
        </div>
        <div class="card">
          <h2>抽取结果</h2>
          ${extractionResultHtml(item)}
        </div>
        <div class="card">
          <h2>复核结论</h2>
          <div class="help">${escapeHtml(reviewGuide(item))}</div>
          <div class="field">
            <label>reviewDecision 复核结论</label>
            <select id="reviewDecision">${optionHtml('reviewDecision', d.reviewDecision || d.decision || defaultDecision(item))}</select>
            <small>accept=有效可入库；reject=应过滤；fix_needed=页面对但抽取需修；entry_point=应作为入口继续展开；unsure=不确定。</small>
          </div>
          <div class="field">
            <label>targetType 页面性质</label>
            <select id="targetType">${optionHtml('targetType', d.targetType || defaultTargetType(item))}</select>
            <small>用于判断应该抓详情、继续展开列表、解析附件，还是屏蔽登录/无关页面。</small>
          </div>
          <div class="field">
            <label>announcementType 公告类型</label>
            <select id="announcementType">${optionHtml('announcementType', d.announcementType || item.announcementType || 'unknown')}</select>
          </div>
          <div class="field">
            <label>year 年份</label>
            <select id="year">
              ${['2026','2025','2024','unknown'].map(v => `<option value="${v}" ${(d.year || inferYear(item) || 'unknown') === v ? 'selected' : ''}>${v === 'unknown' ? 'unknown 未知' : v + ' 年'}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>officialness 官方性</label>
            <select id="officialness">${optionHtml('officialness', d.officialness || defaultOfficialness(item))}</select>
          </div>
          <div class="field">
            <label>problemTags 问题标签</label>
            <div class="checkbox-grid">${checkboxHtml('problemTags', d.problemTags || suggestedProblemTags(item))}</div>
            <small>多选。描述“为什么需要修”，例如截止时间缺失、附件未解析、列表未展开、登录页等。</small>
          </div>
          <div class="field">
            <label>suggestedAction 建议动作</label>
            <div class="checkbox-grid">${checkboxHtml('suggestedAction', d.suggestedAction || suggestedActions(item))}</div>
            <small>多选。用于我后续把标注转成 crawl-overrides、site-crawl-rules 或 extractor 修复任务。</small>
          </div>
          <div class="field">
            <label>suggestedUrl 推荐 URL</label>
            <input id="suggestedUrl" style="width:100%" value="${escapeAttr(d.suggestedUrl || d.replacementUrl || '')}" placeholder="如果发现更合适的官方入口或详情页，贴在这里" />
          </div>
          <div class="field">
            <label>note 备注</label>
            <textarea id="note" placeholder="一句话说明判断依据，例如：这是院系官方 2026 预推免公告，但 deadline 没抽出来。">${escapeHtml(d.note || '')}</textarea>
          </div>
          <div class="bar">
            <button class="primary" onclick="saveDecision()">保存结构化复核</button>
            <button class="good" onclick="quickSet('accept')">有效可入库</button>
            <button class="bad" onclick="quickSet('reject')">应过滤</button>
            <button onclick="quickSet('fix_needed')">抽取需修</button>
            <button onclick="quickSet('entry_point')">作为入口</button>
          </div>
        </div>
        <div class="card">
          <h2>运营干预（直连后端）</h2>
          <div class="help">编辑后会立即生效到生产库，触发 ProgressChangeEvent，关注该公告的用户会收到推送。</div>
          <div class="field">
            <label>campId（item 类型为 low_quality_item 时自动填入）</label>
            <input id="adminCampId" style="width:100%" value="${escapeAttr(item.campId || (item.type === 'low_quality_item' ? item.id : ''))}" placeholder="若为低质量产物，填该公告UUID（item.campId）" />
          </div>
          <div class="field">
            <label>修正 deadline（ISO 格式，如 2025-09-10T18:00:00）</label>
            <input id="adminDeadline" style="width:100%" placeholder="2025-09-10T18:00:00 或留空" />
          </div>
          <div class="field">
            <label>修正 startDate / endDate（可选）</label>
            <input id="adminStartDate" style="width:48%;display:inline-block" placeholder="startDate" />
            <input id="adminEndDate" style="width:48%;display:inline-block;margin-left:4%" placeholder="endDate" />
          </div>
          <div class="field">
            <label>状态修改</label>
            <select id="adminStatus">
              <option value="">— 不修改 —</option>
              <option value="published">published 上架</option>
              <option value="hidden">hidden 下架</option>
              <option value="expired">expired 已过期</option>
              <option value="draft">draft 草稿</option>
            </select>
          </div>
          <div class="field">
            <label>子类型（可重新分类）</label>
            <select id="adminSubType">
              <option value="">— 不修改 —</option>
              <option value="specific">specific 具体公告</option>
              <option value="framework">framework 框架文档</option>
            </select>
          </div>
          <div class="bar">
            <button class="primary" onclick="adminEditCamp()">保存字段修改</button>
            <button onclick="adminRecrawl('${escapeAttr(item.universityId || '')}')">立即重抓该校</button>
            <button onclick="adminRecrawl('')">触发P0全量重抓</button>
          </div>
          <div id="adminResult" style="margin-top:8px;font-size:12px;color:#666"></div>
        </div>
        <div class="card">
          <h2>证据预览</h2>
          <div class="evidence">${escapeHtml(item.contentPreview || item.snippet || '无可展示片段').replace(/\n/g, '<br>')}</div>
        </div>`;
    }

    window.selectSchool = (id) => { selectedSchool = id; $('schoolFilter').value = id; render(); };
    window.clearSchool = () => { selectedSchool = ''; $('schoolFilter').value = ''; render(); };
    window.selectItem = (id) => { selectedId = id; render(); renderDetail(payload.items.find(x => x.id === id)); };
    window.quickSet = async (decision) => { $('reviewDecision').value = decision; await saveDecision(); };

    window.saveDecision = async () => {
      const item = payload.items.find(x => x.id === selectedId);
      if (!item) return;
      const reviewDecision = $('reviewDecision').value;
      await postDecision({
        id: item.id,
        decision: reviewDecision,
        reviewDecision,
        targetType: $('targetType').value,
        announcementType: $('announcementType').value,
        year: $('year').value,
        officialness: $('officialness').value,
        problemTags: checkedValues('problemTags'),
        suggestedAction: checkedValues('suggestedAction'),
        suggestedUrl: $('suggestedUrl').value,
        replacementUrl: $('suggestedUrl').value,
        note: $('note').value
      });
      await load();
      selectedId = item.id;
      render();
    };

    function optionHtml(dictName, selected) {
      return Object.entries(DICTS[dictName]).map(([value, text]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${value} · ${escapeHtml(text)}</option>`).join('');
    }

    function checkboxHtml(dictName, selected) {
      const set = new Set(selected || []);
      return Object.entries(DICTS[dictName]).map(([value, text]) => `<label class="check"><input type="checkbox" name="${dictName}" value="${value}" ${set.has(value) ? 'checked' : ''}><span>${value}<br><small>${escapeHtml(text)}</small></span></label>`).join('');
    }

    function checkedValues(name) {
      return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(x => x.value);
    }

    function unique(values) { return [...new Set(values)].filter(Boolean).sort(); }
    function label(dictName, value) { return value ? `${value} · ${(DICTS[dictName] || {})[value] || value}` : ''; }
    function decisionClass(value) {
      if (value === 'accept') return 'accepted';
      if (value === 'reject') return 'rejected';
      if (value === 'fix_needed' || value === 'entry_point') return 'needs';
      return '';
    }
    function inferYear(item) {
      const text = [item.title, item.snippet, item.reason, item.contentPreview].join(' ');
      const match = text.match(/20(2[4-6])/);
      return match ? `20${match[1]}` : 'unknown';
    }
    function defaultDecision(item) {
      if (item.type === 'low_quality_item') return 'fix_needed';
      if (item.type === 'no_candidate') return 'entry_point';
      return 'unsure';
    }
    function defaultTargetType(item) {
      const url = item.url || '';
      if (url.match(/\.(pdf|docx?|xlsx?)($|\?)/i) || url.includes('download.jsp')) return 'attachment';
      if (url.match(/login|default\.aspx|zsxt|zsgl/i)) return 'login_system';
      if (item.type === 'no_candidate') return 'list_page';
      return item.type === 'low_quality_item' ? 'detail_page' : 'detail_page';
    }
    function defaultOfficialness(item) {
      if ((item.url || '').includes('.edu.cn')) return 'official';
      return 'unknown';
    }
    function suggestedProblemTags(item) {
      const tags = [];
      const text = [item.title, item.url, item.reason].join(' ');
      if (item.type === 'low_quality_item') {
        if ((item.reason || '').includes('deadline')) tags.push('deadline_missing');
        if ((item.reason || '').includes('content_len=')) tags.push('content_too_short');
      }
      if (item.type === 'no_candidate') tags.push('list_not_expanded');
      if (text.match(/login|default\.aspx|报名系统|登录/)) tags.push('login_page');
      if (text.match(/download|附件|\.pdf|\.doc/)) tags.push('attachment_not_parsed');
      return tags;
    }
    function suggestedActions(item) {
      const actions = [];
      if (item.type === 'no_candidate') actions.push('add_entry_point');
      if (item.type === 'not_emitted') actions.push('add_allow_pattern');
      if (item.type === 'dropped_candidate') actions.push('add_block_pattern');
      if (item.type === 'low_quality_item') actions.push('improve_date_extract');
      if ((item.url || '').match(/download|\.pdf|\.doc/i)) actions.push('parse_attachment');
      return actions;
    }
    function fieldSummary(item) {
      const rows = [
        ['announcementType 公告类型', item.announcementType],
        ['publishDate 发布日期', item.publishDate],
        ['deadline 截止时间', item.deadline],
        ['startDate 开始时间', item.startDate],
        ['endDate 结束时间', item.endDate],
        ['location 地点', item.location],
        ['confidence 置信度', item.confidence]
      ].filter(x => x[1] !== undefined && x[1] !== null && x[1] !== '');
      return rows.length ? rows.map(([k, v]) => `<span class="pill">${escapeHtml(k)}：${escapeHtml(v)}</span>`).join(' ') : '无';
    }
    function extractionResultHtml(item) {
      if (!item.contentPreview && !item.announcementType && !item.deadline && !item.startDate && !item.endDate && !item.publishDate && !item.location) {
        return `<div class="help">尚未进入抽取产物，所以没有“抽取正文预览”和“已抽字段”。这类记录主要看标题、URL 和候选片段；如果打开 URL 后确认是真公告，请标为 fix_needed，通常建议 add_allow_pattern 或 increase_school_limit。</div>`;
      }
      return `
        <div class="grid" style="margin-bottom:10px">
          <div class="label">已抽字段</div><div>${fieldSummary(item)}</div>
        </div>
        <div class="label" style="margin-bottom:6px">抽取正文预览</div>
        <div class="evidence">${escapeHtml(item.contentPreview || '无正文预览').replace(/\n/g, '<br>')}</div>`;
    }
    function decisionHint(item) {
      if (item.type === 'no_candidate') return '重点表达：有没有新的官方入口 URL。推荐 decision=entry_point，targetType=list_page。';
      if (item.type === 'fetch_error') return '重点表达：URL 是否官方且值得特殊抓取。反爬/412/证书问题选 fix_needed，404 或无关页选 reject。';
      if (item.type === 'dropped_candidate') return '重点表达：过滤是否正确。若是附件/登录页/名单，选 reject；若是真公告，选 fix_needed 或 accept。';
      if (item.type === 'not_emitted') return '重点表达：这是应抓详情，还是应该作为入口展开，或应该屏蔽。';
      if (item.type === 'low_quality_item') return '重点表达：内容是否有效、缺哪些字段。通常选 accept 或 fix_needed，并勾 deadline_missing/date_wrong。';
      return '打开 URL，结合标题、原因和片段判断。';
    }
    function evidenceSourceLabel(item) {
      if (item.type === 'low_quality_item') return '抽取正文预览：来自已解析产物 content，可用于判断抽取质量和字段缺失。';
      if (item.snippet) return '候选片段：来自入口页/列表页/搜索发现阶段的上下文，不代表详情页正文已成功抽取。';
      return '无片段：主要依赖标题、URL、抓取原因和打开原文判断。';
    }
    function reviewGuide(item) {
      if (item.type === 'low_quality_item') {
        return '这是已抽取产物的质量复核。请用“已抽字段”和“抽取正文预览”判断是否可入库；若正文有效但字段缺失，选 fix_needed，并勾 deadline_missing/date_wrong/content_too_short 等。';
      }
      if (item.type === 'not_emitted') {
        return '这是候选复核，不是抽取结果复核。当前“候选片段”只说明入口页发现了这个 URL。请打开 URL 判断：真公告选 fix_needed 或 accept；应作为列表入口选 entry_point；系统页/无关页选 reject。';
      }
      if (item.type === 'dropped_candidate') {
        return '这是被过滤候选复核。若它确实是附件、登录页、旧年、无关主题，选 reject 并勾对应标签；若它其实是真公告，选 fix_needed，并建议 add_allow_pattern。';
      }
      if (item.type === 'no_candidate') {
        return '这是学校覆盖复核。请填写 suggestedUrl 推荐入口，并选 entry_point；如果官网无法访问，在备注里说明。';
      }
      return '请优先选“复核结论”和“页面性质”。英文值旁都有中文含义，保存后我可以把标注转成入口、过滤、抽取和日期解析规则。';
    }

    async function postDecision(body) {
      await fetch('/api/decision', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
    }

    // 运营干预：编辑公告字段
    window.adminEditCamp = async () => {
      const campId = $('adminCampId').value.trim();
      if (!campId) { showAdminResult('请填写 campId', true); return; }
      const body = {};
      const dl = $('adminDeadline').value.trim(); if (dl) body.deadline = dl;
      const sd = $('adminStartDate').value.trim(); if (sd) body.startDate = sd;
      const ed = $('adminEndDate').value.trim(); if (ed) body.endDate = ed;
      const st = $('adminStatus').value; if (st) body.status = st;
      const stp = $('adminSubType').value; if (stp) body.subType = stp;
      if (Object.keys(body).length === 0) { showAdminResult('未填写任何修改字段', true); return; }
      showAdminResult('提交中…', false);
      try {
        const r = await fetch('/api/admin-edit', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ campId, ...body }) });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || '请求失败');
        showAdminResult('✅ 已保存：' + (data.updatedFields || []).join(',') + '。关注用户将在下次推送窗口收到通知。', false);
      } catch (e) { showAdminResult('❌ ' + e.message, true); }
    };

    // 运营干预：触发重抓
    window.adminRecrawl = async (universityId) => {
      const label = universityId ? `学校 ${universityId}` : '所有 P0 重点校';
      if (!confirm(`确定立即重抓 ${label}？此操作会消耗 LLM 配额，且任务可能持续数分钟。`)) return;
      showAdminResult('触发中…', false);
      try {
        const body = universityId ? { universityId } : { priority: 'P0' };
        const r = await fetch('/api/admin-recrawl', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || '请求失败');
        showAdminResult(`✅ 重抓已触发，taskId=${data.taskId || '-'}`, false);
      } catch (e) { showAdminResult('❌ ' + e.message, true); }
    };

    function showAdminResult(text, isError) {
      const el = $('adminResult');
      if (!el) return;
      el.style.color = isError ? '#c0392b' : '#0a6';
      el.textContent = text;
    }
    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }
    function escapeAttr(value) { return escapeHtml(value).replace(/"/g, '&quot;'); }
    ['q','type','state','severity','schoolFilter'].forEach(id => $(id).addEventListener('input', () => { if (id === 'schoolFilter') selectedSchool = $(id).value; render(); }));
    $('reload').addEventListener('click', load);
    load();
  </script>
</body>
</html>
"""


class ReviewHandler(BaseHTTPRequestHandler):
    server_version = "ManualReviewServer/0.1"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self.send_text(INDEX_HTML, "text/html; charset=utf-8")
            return
        if parsed.path == "/api/queue":
            data = build_queue(
                self.server.summary_path,
                self.server.candidates_path,
                self.server.items_path,
                self.server.decisions_path,
            )
            self.send_json(data)
            return
        if parsed.path == "/api/decisions":
            self.send_json(read_jsonl(self.server.decisions_path))
            return
        self.send_error(404)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        length = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(length).decode("utf-8") or "{}"

        # β场景运营干预端点：手工编辑公告字段
        if parsed.path == "/api/admin-edit":
            payload = json.loads(raw)
            camp_id = (payload.get("campId") or "").strip()
            if not camp_id:
                self.send_json_status(400, {"error": "campId required"})
                return
            patch_body = {k: v for k, v in payload.items() if k != "campId"}
            code, data = call_backend("PATCH", f"/admin/camps/{camp_id}", patch_body)
            self.send_json_status(code, data)
            return

        # β场景运营干预端点：立即重抓
        if parsed.path == "/api/admin-recrawl":
            payload = json.loads(raw)
            code, data = call_backend("POST", "/admin/camps/recrawl", payload)
            self.send_json_status(code, data)
            return

        if parsed.path != "/api/decision":
            self.send_error(404)
            return
        payload = json.loads(raw)
        row = {
            "id": str(payload.get("id") or ""),
            "decision": str(payload.get("decision") or ""),
            "reviewDecision": str(payload.get("reviewDecision") or payload.get("decision") or ""),
            "targetType": str(payload.get("targetType") or ""),
            "announcementType": str(payload.get("announcementType") or ""),
            "year": str(payload.get("year") or ""),
            "officialness": str(payload.get("officialness") or ""),
            "problemTags": payload.get("problemTags") if isinstance(payload.get("problemTags"), list) else [],
            "suggestedAction": payload.get("suggestedAction") if isinstance(payload.get("suggestedAction"), list) else [],
            "suggestedUrl": str(payload.get("suggestedUrl") or ""),
            "note": str(payload.get("note") or ""),
            "replacementUrl": str(payload.get("replacementUrl") or ""),
            "reviewedAt": datetime.utcnow().isoformat(),
        }
        if not row["id"] or not row["decision"]:
            self.send_error(400, "id and decision are required")
            return
        write_jsonl_append(self.server.decisions_path, row)
        self.send_json({"ok": True, "decision": row})

    def send_json(self, value: Any) -> None:
        body = json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_json_status(self, status: int, value: Any) -> None:
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_text(self, value: str, content_type: str) -> None:
        body = value.encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: Any) -> None:
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Start temporary crawler manual review console.")
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    parser.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES)
    parser.add_argument("--items", type=Path, default=DEFAULT_ITEMS)
    parser.add_argument("--decisions", type=Path, default=DEFAULT_DECISIONS)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    server = ThreadingHTTPServer((args.host, args.port), ReviewHandler)
    server.summary_path = args.summary
    server.candidates_path = args.candidates
    server.items_path = args.items
    server.decisions_path = args.decisions
    print(f"Manual review console: http://{args.host}:{args.port}")
    print(f"Summary: {args.summary}")
    print(f"Decisions: {args.decisions}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

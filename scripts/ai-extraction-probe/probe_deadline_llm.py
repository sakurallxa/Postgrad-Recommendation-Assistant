#!/usr/bin/env python3
"""
Phase 0 Probe — Can DeepSeek extract `deadline` correctly when the regex spider can't?

This script reads N samples (default: probe_samples.jsonl, 10 missing-deadline cases)
and asks DeepSeek to return:
  - announcementType
  - deadline / startDate / endDate
  - evidence_quote for each (mandatory; substring-checked against source)
  - confidence

It then prints / writes:
  - probe_results.jsonl  (per-sample raw record, append-only — safe to resume)
  - probe_results.json   (final aggregate)
  - probe_results.md     (markdown comparison table)

Usage:
    cd <repo>/scripts/ai-extraction-probe
    python3 probe_deadline_llm.py                       # run all samples
    python3 probe_deadline_llm.py --only 1 2 5          # only those indices
    python3 probe_deadline_llm.py --samples ./other.jsonl

Reads `DEEPSEEK_API_KEY` from (in order):
    1. backend/.env (auto-detected relative to repo root)
    2. environment variable DEEPSEEK_API_KEY
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import urllib.request
import urllib.error


SCRIPT_DIR = Path(__file__).resolve().parent
# scripts/ai-extraction-probe/  ->  repo root is parents[2]
REPO_ROOT = SCRIPT_DIR.parents[1]


# ---------- helpers ----------

def find_env_file() -> Path | None:
    """Look for backend/.env, .env, and parent fallbacks."""
    candidates = [
        REPO_ROOT / "backend" / ".env",
        REPO_ROOT / ".env",
        SCRIPT_DIR / ".env",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path or not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def normalize_for_match(s: str) -> str:
    """Aggressive normalization so PDF-spacing or full-width chars don't break match."""
    if not s:
        return ""
    s = re.sub(r"\s+", "", s)
    table = str.maketrans({
        "０": "0", "１": "1", "２": "2", "３": "3", "４": "4",
        "５": "5", "６": "6", "７": "7", "８": "8", "９": "9",
        "：": ":", "－": "-", "—": "-", "–": "-", "．": ".",
    })
    return s.translate(table)


def grounding_check(evidence: str, content: str) -> bool:
    """True if evidence (or a meaningful 12+ char subset) actually appears in content."""
    if not evidence:
        return False
    norm_ev = normalize_for_match(evidence)
    norm_ct = normalize_for_match(content)
    if not norm_ev:
        return False
    if norm_ev in norm_ct:
        return True
    if len(norm_ev) >= 12:
        for i in range(0, len(norm_ev) - 11):
            chunk = norm_ev[i:i + 12]
            if chunk in norm_ct:
                return True
    return False


PROMPT_TEMPLATE = """你是一个夏令营/预推免公告日期抽取助手。请只从下列正文中抽取以下字段，必须严格基于正文，禁止编造。

公告标题：{title}
学校：{university}
已知类型（仅供参考）：{ann_type}

正文（最多 8000 字符，可能有 PDF 抽取后的空格混乱）：
\"\"\"
{content}
\"\"\"

任务：
1. 判断 announcementType：summer_camp 或 pre_recommendation
2. 抽取以下日期字段（如正文确实没有则填 null）：
   - deadline：报名截止时间（最重要！）。注意：
     * 是"报名/申请/材料提交"的截止，不是"录取确认"或"复试"
     * 区间表达如"6月13日至7月4日"取最后日期
     * 推免章程类公告如果只描述国家统一推免系统的注册/确认时间（9月22日等），deadline 应为 null
   - startDate：营期/活动开始日期
   - endDate：营期/活动结束日期
3. 每个非 null 字段必须同时给出 evidence_quote：正文中**完整且原样**的那句话（10-80 字），作为依据
4. 给出 0-1 的整体 confidence

输出**仅一个 JSON 对象**，不要任何其他文字：
{{
  "announcementType": "summer_camp" 或 "pre_recommendation",
  "deadline": "YYYY-MM-DD" 或 "YYYY-MM-DDTHH:MM" 或 null,
  "deadline_evidence": "原文摘录" 或 null,
  "startDate": "YYYY-MM-DD" 或 null,
  "startDate_evidence": "原文摘录" 或 null,
  "endDate": "YYYY-MM-DD" 或 null,
  "endDate_evidence": "原文摘录" 或 null,
  "confidence": 0.0-1.0,
  "reasoning": "1-2 句说明判断依据"
}}
"""


def call_deepseek(api_url: str, api_key: str, model: str, prompt: str, retries: int = 2) -> dict[str, Any]:
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": "你是一个严谨的中文公告抽取助手。仅基于给定正文回答，从不编造。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.1,
        "max_tokens": 800,
        "response_format": {"type": "json_object"},
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{api_url.rstrip('/')}/chat/completions",
        data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )

    last_err: Exception | None = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                content = data["choices"][0]["message"]["content"]
                usage = data.get("usage", {})
                return {"ok": True, "parsed": json.loads(content), "usage": usage}
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="ignore") if hasattr(e, "read") else ""
            last_err = RuntimeError(f"HTTPError {e.code}: {body[:300]}")
        except Exception as e:
            last_err = e
        time.sleep(1.5 * (attempt + 1))
    return {"ok": False, "error": str(last_err)}


def process_sample(idx: int, s: dict[str, Any], api_url: str, api_key: str, model: str) -> dict[str, Any]:
    univ = s.get("universityName") or s.get("universityId") or "?"
    title = (s.get("title") or "")[:90]
    ann_type = s.get("announcementType") or "?"
    content = (s.get("content") or s.get("description") or "")[:8000]

    prompt = PROMPT_TEMPLATE.format(title=title, university=univ, ann_type=ann_type, content=content)
    t0 = time.time()
    resp = call_deepseek(api_url, api_key, model, prompt)
    elapsed = time.time() - t0

    rec: dict[str, Any] = {
        "index": idx,
        "universityId": s.get("universityId"),
        "universityName": univ,
        "title": title,
        "originalAnnouncementType": ann_type,
        "contentLen": len(content),
        "sourceUrl": s.get("sourceUrl"),
        "elapsedSec": round(elapsed, 2),
    }

    if not resp["ok"]:
        rec["status"] = "API_ERROR"
        rec["error"] = resp.get("error")
        return rec

    p = resp["parsed"]
    usage = resp.get("usage", {})
    rec.update({
        "status": "OK",
        "llmAnnouncementType": p.get("announcementType"),
        "llmDeadline": p.get("deadline"),
        "llmDeadlineEvidence": p.get("deadline_evidence"),
        "llmStartDate": p.get("startDate"),
        "llmStartDateEvidence": p.get("startDate_evidence"),
        "llmEndDate": p.get("endDate"),
        "llmEndDateEvidence": p.get("endDate_evidence"),
        "llmConfidence": p.get("confidence"),
        "llmReasoning": p.get("reasoning"),
        "promptTokens": usage.get("prompt_tokens"),
        "completionTokens": usage.get("completion_tokens"),
    })
    if p.get("deadline"):
        rec["deadlineGrounded"] = grounding_check(p.get("deadline_evidence") or "", content)
    else:
        rec["deadlineGrounded"] = None
    return rec


def write_report(results: list[dict[str, Any]], json_path: Path, md_path: Path) -> dict[str, Any]:
    ok = [r for r in results if r.get("status") == "OK"]
    api_errors = [r for r in results if r.get("status") == "API_ERROR"]
    deadline_extracted = [r for r in ok if r.get("llmDeadline")]
    deadline_null = [r for r in ok if not r.get("llmDeadline")]
    grounded = [r for r in deadline_extracted if r.get("deadlineGrounded") is True]
    not_grounded = [r for r in deadline_extracted if r.get("deadlineGrounded") is False]

    total_in = sum(r.get("promptTokens") or 0 for r in ok)
    total_out = sum(r.get("completionTokens") or 0 for r in ok)
    est_cost_usd = round(total_in * 0.27e-6 + total_out * 1.10e-6, 4)

    summary = {
        "total": len(results),
        "apiOk": len(ok),
        "apiErrors": len(api_errors),
        "deadlineExtracted": len(deadline_extracted),
        "deadlineNull": len(deadline_null),
        "grounded": len(grounded),
        "notGrounded": len(not_grounded),
        "totalInputTokens": total_in,
        "totalOutputTokens": total_out,
        "estimatedCostUSD": est_cost_usd,
    }

    json_path.write_text(
        json.dumps({"summary": summary, "results": results}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    lines = [
        "# Phase 0 Probe — DeepSeek deadline extraction",
        "",
        f"- total samples: {summary['total']}",
        f"- API success: {summary['apiOk']}  /  errors: {summary['apiErrors']}",
        f"- deadline extracted: {summary['deadlineExtracted']}  /  said null: {summary['deadlineNull']}",
        f"- grounded (evidence found in source): {summary['grounded']}  /  hallucinated: {summary['notGrounded']}",
        f"- tokens: in={summary['totalInputTokens']} out={summary['totalOutputTokens']}  ≈ ${summary['estimatedCostUSD']}",
        "",
        "## Per-sample",
        "",
        "| # | univ | type(orig→llm) | deadline | grounded | conf | evidence |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in results:
        if r.get("status") == "API_ERROR":
            lines.append(f"| {r['index']} | {r['universityName']} | - | API_ERROR | - | - | {r.get('error','')[:60]} |")
            continue
        ev = (r.get("llmDeadlineEvidence") or "")[:80].replace("|", "/").replace("\n", " ")
        lines.append(
            f"| {r['index']} | {r['universityName']} | "
            f"{r['originalAnnouncementType']}→{r.get('llmAnnouncementType')} | "
            f"{r.get('llmDeadline') or '∅'} | {r.get('deadlineGrounded')} | "
            f"{r.get('llmConfidence')} | {ev} |"
        )
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", default=str(SCRIPT_DIR / "probe_samples.jsonl"))
    parser.add_argument("--results-jl", default=str(SCRIPT_DIR / "probe_results.jsonl"))
    parser.add_argument("--results-json", default=str(SCRIPT_DIR / "probe_results.json"))
    parser.add_argument("--results-md", default=str(SCRIPT_DIR / "probe_results.md"))
    parser.add_argument("--only", nargs="*", type=int, help="Only run these 1-based indices")
    parser.add_argument("--fresh", action="store_true", help="Truncate results.jsonl before running")
    args = parser.parse_args()

    env_file = find_env_file()
    env = load_env(env_file) if env_file else {}
    api_key = env.get("DEEPSEEK_API_KEY") or os.environ.get("DEEPSEEK_API_KEY")
    api_url = env.get("DEEPSEEK_API_URL") or os.environ.get("DEEPSEEK_API_URL") or "https://api.deepseek.com/v1"
    model = env.get("DEEPSEEK_MODEL") or os.environ.get("DEEPSEEK_MODEL") or "deepseek-chat"

    if not api_key:
        print("ERROR: DEEPSEEK_API_KEY not found in backend/.env or environment.", file=sys.stderr)
        return 2

    samples_path = Path(args.samples)
    if not samples_path.exists():
        print(f"ERROR: samples file not found: {samples_path}", file=sys.stderr)
        return 2

    samples: list[dict[str, Any]] = []
    with samples_path.open() as f:
        for line in f:
            line = line.strip()
            if line:
                samples.append(json.loads(line))

    indices = args.only or list(range(1, len(samples) + 1))
    print(f"Loaded {len(samples)} samples from {samples_path}")
    print(f"Will run indices: {indices}")
    print(f"Model: {model}   URL: {api_url}\n")

    results_jl = Path(args.results_jl)
    if args.fresh and results_jl.exists():
        results_jl.unlink()

    all_results: list[dict[str, Any]] = []
    for idx in indices:
        if idx < 1 or idx > len(samples):
            print(f"  skipping out-of-range idx {idx}")
            continue
        s = samples[idx - 1]
        rec = process_sample(idx, s, api_url, api_key, model)
        all_results.append(rec)
        with results_jl.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

        univ = rec["universityName"]
        if rec["status"] == "API_ERROR":
            print(f"[{idx}] API_ERROR ({rec['elapsedSec']}s) {univ}: {rec.get('error','')[:120]}")
        else:
            print(
                f"[{idx}] OK ({rec['elapsedSec']}s) {univ:>14} | "
                f"deadline={str(rec.get('llmDeadline')):28s} grounded={str(rec.get('deadlineGrounded')):5s} "
                f"conf={rec.get('llmConfidence')}"
            )
            if rec.get("llmDeadlineEvidence"):
                print(f"     evidence: {(rec.get('llmDeadlineEvidence') or '')[:120]}")
        time.sleep(0.3)

    summary = write_report(all_results, Path(args.results_json), Path(args.results_md))
    print(f"\n=== Summary ===")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"\nWrote {args.results_jl}, {args.results_json}, {args.results_md}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
import argparse
import csv
import json
from pathlib import Path


def load_csv_rows(path: Path):
    with path.open("r", encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def load_summary(path: Path):
    with path.open("r", encoding="utf-8") as fh:
        payload = json.load(fh)
    schools = payload.get("schools") or {}
    return payload, schools


def summarize_drop_reasons(drop_reasons):
    if not drop_reasons:
        return ""
    return ";".join(
        f"{key}:{value}"
        for key, value in sorted(drop_reasons.items(), key=lambda item: (-item[1], item[0]))
    )


def school_status(row):
    items_emitted = int(row["itemsEmitted"] or 0)
    detail_candidates = int(row["detailCandidates"] or 0)
    request_errors = int(row["requestErrors"] or 0)
    drop_reasons = row["dropReasons"]
    if items_emitted > 0:
        return "ok"
    if request_errors > 0:
        return "request_error"
    if detail_candidates == 0:
        return "no_candidate"
    if drop_reasons:
        return "filtered"
    return "unknown"


def main():
    parser = argparse.ArgumentParser(description="Generate crawler coverage report from summary JSON files.")
    parser.add_argument("--target-csv", required=True, help="CSV file listing target schools.")
    parser.add_argument("--summary", action="append", required=True, help="Crawler summary JSON path. Repeatable.")
    parser.add_argument("--output-csv", required=True, help="Output CSV path.")
    parser.add_argument("--output-md", required=True, help="Output markdown summary path.")
    args = parser.parse_args()

    target_csv = Path(args.target_csv)
    summary_paths = [Path(item) for item in args.summary]
    output_csv = Path(args.output_csv)
    output_md = Path(args.output_md)

    targets = load_csv_rows(target_csv)
    summary_payloads = []
    school_map = {}

    for path in summary_paths:
        payload, schools = load_summary(path)
        summary_payloads.append((path, payload))
        for school_id, school in schools.items():
            school_map[school_id] = school
            school_name = (school.get("name") or "").strip()
            if school_name:
                school_map[school_name] = school

    rows = []
    totals = {
        "schools": 0,
        "ok": 0,
        "request_error": 0,
        "no_candidate": 0,
        "filtered": 0,
        "unknown": 0,
    }
    filtered_rows = []

    for target in targets:
        school = school_map.get(target["id"], {}) or school_map.get(target["name"], {})
        row = {
            "id": target["id"],
            "name": target["name"],
            "region": target["region"],
            "level": target["level"],
            "priority": target["priority"],
            "website": target["website"],
            "plannedEntryCount": school.get("plannedEntryCount", 0),
            "listPagesVisited": school.get("listPagesVisited", 0),
            "detailCandidates": school.get("detailCandidates", 0),
            "detailPagesVisited": school.get("detailPagesVisited", 0),
            "detailsFiltered": school.get("detailsFiltered", 0),
            "itemsEmitted": school.get("itemsEmitted", 0),
            "requestErrors": school.get("requestErrors", 0),
            "dropReasons": summarize_drop_reasons(school.get("dropReasons") or {}),
        }
        row["status"] = school_status(row)
        rows.append(row)
        totals["schools"] += 1
        totals[row["status"]] += 1
        if row["status"] in {"request_error", "no_candidate", "filtered", "unknown"}:
            filtered_rows.append(row)

    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "id",
                "name",
                "region",
                "level",
                "priority",
                "website",
                "plannedEntryCount",
                "listPagesVisited",
                "detailCandidates",
                "detailPagesVisited",
                "detailsFiltered",
                "itemsEmitted",
                "requestErrors",
                "dropReasons",
                "status",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    lines = [
        f"# Coverage Report",
        "",
        f"- target_csv: {target_csv}",
        f"- summaries: {', '.join(str(path) for path in summary_paths)}",
        f"- schools: {totals['schools']}",
        f"- ok: {totals['ok']}",
        f"- request_error: {totals['request_error']}",
        f"- no_candidate: {totals['no_candidate']}",
        f"- filtered: {totals['filtered']}",
        f"- unknown: {totals['unknown']}",
        "",
        "## Needs Attention",
        "",
        "| priority | name | status | itemsEmitted | detailCandidates | requestErrors | dropReasons |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]

    for row in sorted(filtered_rows, key=lambda item: (item["priority"], item["status"], item["name"])):
        lines.append(
            f"| {row['priority']} | {row['name']} | {row['status']} | {row['itemsEmitted']} | "
            f"{row['detailCandidates']} | {row['requestErrors']} | {row['dropReasons'] or '-'} |"
        )

    output_md.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

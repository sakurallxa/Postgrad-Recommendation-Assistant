#!/usr/bin/env python3
import json
import sys
from pathlib import Path

import requests
from scrapy.http import HtmlResponse, Request


def configure_stdout():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")


def main():
    configure_stdout()

    if len(sys.argv) < 4:
        raise SystemExit("usage: extract-camp-page.py <url> <university_name> <fallback_title>")

    url = sys.argv[1]
    university_name = sys.argv[2]
    fallback_title = sys.argv[3]

    backend_root = Path(__file__).resolve().parent.parent
    project_root = backend_root.parent
    sys.path.insert(0, str(project_root / "crawler"))

    from baoyan_crawler.spiders.university_spider import UniversitySpider

    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 Codex Replay"})
    response = session.get(url, timeout=25)
    response.raise_for_status()
    if not response.encoding or response.encoding.lower() == "iso-8859-1":
        response.encoding = response.apparent_encoding or "utf-8"

    html = response.text
    scrapy_response = HtmlResponse(
        url=url,
        body=html.encode(response.encoding or "utf-8", errors="ignore"),
        encoding=response.encoding or "utf-8",
        request=Request(url=url),
    )

    spider = UniversitySpider()
    page_title = spider.extract_page_title(scrapy_response) or fallback_title
    content = spider.extract_content(scrapy_response) or ""
    structured = spider.extract_with_ai(scrapy_response, page_title, content, university_name)

    print(
        json.dumps(
            {
                "title": page_title,
                "content": content,
                "requirements": structured.get("requirements") or {},
                "materials": structured.get("materials") or [],
                "process": structured.get("process") or [],
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()

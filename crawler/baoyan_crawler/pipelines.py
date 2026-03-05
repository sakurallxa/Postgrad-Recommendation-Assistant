import os
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import requests
from scrapy.exceptions import DropItem


def _to_iso_datetime(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value)).isoformat()
    except Exception:
        return None


class ValidationPipeline:
    """基础校验与字段归一化。"""

    def process_item(self, item, spider):
        title = (item.get('title') or '').strip()
        university_id = (item.get('university_id') or '').strip()
        source_url = (item.get('source_url') or '').strip()

        if not title or not university_id or not source_url:
            raise DropItem('camp item 缺少必要字段(title/university_id/source_url)')

        announcement_type = (item.get('announcement_type') or '').strip().lower()
        item['announcement_type'] = (
            'pre_recommendation' if announcement_type == 'pre_recommendation' else 'summer_camp'
        )

        return item


class DatabasePipeline:
    """
    将爬虫产出的 camp 批量上报到后端 ingest 接口，
    由后端统一执行 upsert + ProgressChangeEvent 产出。
    """

    def __init__(
        self,
        ingest_enabled: bool,
        ingest_url: str,
        bearer_token: str,
        ingest_key: str,
        timeout_seconds: int,
        batch_size: int,
        emit_baseline_events: bool,
    ):
        self.ingest_enabled = ingest_enabled
        self.ingest_url = ingest_url
        self.bearer_token = bearer_token
        self.ingest_key = ingest_key
        self.timeout_seconds = timeout_seconds
        self.batch_size = batch_size
        self.emit_baseline_events = emit_baseline_events

        self._buffer: List[Dict[str, Any]] = []
        self._seen_keys = set()
        self._stats = {
            'buffered': 0,
            'deduped': 0,
            'sent': 0,
            'failed': 0,
            'requests': 0,
        }

    @classmethod
    def from_crawler(cls, crawler):
        settings = crawler.settings
        backend_base = (
            settings.get('BACKEND_BASE_URL')
            or os.getenv('BACKEND_BASE_URL')
            or 'http://127.0.0.1:3000'
        ).rstrip('/')
        ingest_url = (
            settings.get('CRAWLER_INGEST_URL')
            or os.getenv('CRAWLER_INGEST_URL')
            or f'{backend_base}/api/v1/crawler/ingest-camps'
        )
        bearer_token = (
            settings.get('CRAWLER_INGEST_BEARER_TOKEN')
            or os.getenv('CRAWLER_INGEST_BEARER_TOKEN')
            or ''
        ).strip()
        ingest_key = (
            settings.get('CRAWLER_INGEST_KEY')
            or os.getenv('CRAWLER_INGEST_KEY')
            or ''
        ).strip()

        ingest_enabled = str(
            settings.get('CRAWLER_INGEST_ENABLED')
            or os.getenv('CRAWLER_INGEST_ENABLED', '1')
        ).lower() not in ('0', 'false', 'no')
        emit_baseline_events = str(
            settings.get('CRAWLER_INGEST_EMIT_BASELINE_EVENTS')
            or os.getenv('CRAWLER_INGEST_EMIT_BASELINE_EVENTS', '1')
        ).lower() not in ('0', 'false', 'no')

        timeout_seconds = int(
            settings.get('CRAWLER_INGEST_TIMEOUT_SECONDS')
            or os.getenv('CRAWLER_INGEST_TIMEOUT_SECONDS', '15')
        )
        batch_size = int(
            settings.get('CRAWLER_INGEST_BATCH_SIZE')
            or os.getenv('CRAWLER_INGEST_BATCH_SIZE', '30')
        )

        return cls(
            ingest_enabled=ingest_enabled,
            ingest_url=ingest_url,
            bearer_token=bearer_token,
            ingest_key=ingest_key,
            timeout_seconds=max(5, timeout_seconds),
            batch_size=max(1, batch_size),
            emit_baseline_events=emit_baseline_events,
        )

    def open_spider(self, spider):
        if not self.ingest_enabled:
            spider.logger.warning('ingest 已禁用: CRAWLER_INGEST_ENABLED=0')
            return

        spider.logger.info(
            f'ingest 已启用: url={self.ingest_url}, batch_size={self.batch_size}, '
            f'emit_baseline_events={self.emit_baseline_events}'
        )
        if not self.ingest_key:
            spider.logger.warning(
                '未配置 CRAWLER_INGEST_KEY。'
                '后端 ingest 接口默认要求 X-Crawler-Ingest-Key，请求会被拒绝。'
            )

    def close_spider(self, spider):
        self._flush(spider, force=True)
        spider.logger.info(
            '[ingest-summary] '
            f"buffered={self._stats['buffered']} "
            f"deduped={self._stats['deduped']} "
            f"sent={self._stats['sent']} "
            f"failed={self._stats['failed']} "
            f"requests={self._stats['requests']}"
        )

    def process_item(self, item, spider):
        payload_item = self._to_backend_item(item, spider)
        dedupe_key = self._dedupe_key(payload_item)

        if dedupe_key in self._seen_keys:
            self._stats['deduped'] += 1
            return item

        self._seen_keys.add(dedupe_key)
        self._buffer.append(payload_item)
        self._stats['buffered'] += 1

        if len(self._buffer) >= self.batch_size:
            self._flush(spider)

        return item

    def _flush(self, spider, force: bool = False):
        if not self.ingest_enabled:
            self._buffer.clear()
            return

        if not self._buffer:
            return

        if not force and len(self._buffer) < self.batch_size:
            return

        payload_items = self._buffer[:]
        self._buffer.clear()

        payload = {
            'items': payload_items,
            'emitBaselineEvents': self.emit_baseline_events,
        }

        headers = {'Content-Type': 'application/json'}
        if self.bearer_token:
            headers['Authorization'] = f'Bearer {self.bearer_token}'
        if self.ingest_key:
            headers['X-Crawler-Ingest-Key'] = self.ingest_key

        try:
            self._stats['requests'] += 1
            resp = requests.post(
                self.ingest_url,
                json=payload,
                headers=headers,
                timeout=self.timeout_seconds,
            )
            if 200 <= resp.status_code < 300:
                self._stats['sent'] += len(payload_items)
                spider.logger.info(
                    f'[ingest] success status={resp.status_code} count={len(payload_items)}'
                )
                return

            self._stats['failed'] += len(payload_items)
            body = resp.text[:400].replace('\n', ' ')
            spider.logger.error(
                f'[ingest] failed status={resp.status_code} count={len(payload_items)} body={body}'
            )
        except Exception as exc:
            self._stats['failed'] += len(payload_items)
            spider.logger.error(f'[ingest] exception count={len(payload_items)} err={exc}')

    def _to_backend_item(self, item, spider) -> Dict[str, Any]:
        now_iso = datetime.utcnow().isoformat()
        return {
            'title': (item.get('title') or '').strip(),
            'announcementType': item.get('announcement_type') or 'summer_camp',
            'universityId': item.get('university_id'),
            'sourceUrl': item.get('source_url'),
            'publishDate': _to_iso_datetime(item.get('publish_date')),
            'deadline': _to_iso_datetime(item.get('deadline')),
            'startDate': _to_iso_datetime(item.get('start_date')),
            'endDate': _to_iso_datetime(item.get('end_date')),
            'requirements': item.get('requirements') or {},
            'materials': item.get('materials') or [],
            'process': item.get('process') or [],
            'contact': item.get('contact') or {},
            'content': item.get('content') or '',
            'confidence': item.get('confidence') if item.get('confidence') is not None else 0.76,
            'crawlTime': now_iso,
            'spiderName': spider.name,
        }

    def _dedupe_key(self, item: Dict[str, Any]) -> Tuple[str, str]:
        return (
            str(item.get('universityId') or ''),
            str(item.get('sourceUrl') or ''),
        )


class AIExtractionPipeline:
    """
    预留：后续接入更复杂 AI 抽取链路。
    当前实现为 no-op，保持 settings 中管道顺序兼容。
    """

    def process_item(self, item, spider):
        return item

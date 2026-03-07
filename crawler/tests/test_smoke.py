from pathlib import Path


def test_crawler_layout_smoke():
    """Basic smoke check to ensure crawler project layout is present."""
    root = Path(__file__).resolve().parents[1]
    assert (root / "scrapy.cfg").exists()
    assert (root / "baoyan_crawler" / "settings.py").exists()
    assert (root / "baoyan_crawler" / "spiders").exists()

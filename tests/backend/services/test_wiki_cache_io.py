"""Wiki cache files written before the comprehensive/concise suffix existed.

Those were named `deepwiki_cache_{type}_{owner}_{repo}_{lang}.json` and were
always produced by the comprehensive default, so they must stay readable (and
deletable) as the comprehensive variant.
"""

import os

import pytest

import api.services.wiki.io as wio
from api.schemas import WikiCacheData, WikiStructureModel, asave


@pytest.fixture
def cache_dir(monkeypatch, tmp_path):
    monkeypatch.setattr(wio, "WIKI_CACHE_DIR", str(tmp_path))
    return tmp_path


def _cache(title: str) -> WikiCacheData:
    return WikiCacheData(
        wiki_structure=WikiStructureModel(
            id="w", title=title, description="d", pages=[]
        ),
        generated_pages={},
    )


async def _write_legacy(cache_dir, title="legacy"):
    path = cache_dir / "deepwiki_cache_github_octo_my_repo_en.json"
    await asave(_cache(title), str(path), encoding="utf-8")
    return path


@pytest.mark.asyncio
async def test_legacy_cache_is_read_as_comprehensive(cache_dir):
    await _write_legacy(cache_dir)

    assert wio.wiki_cache_exists("octo", "my_repo", "github", "en")
    data = await wio.read_wiki_cache("octo", "my_repo", "github", "en")
    assert data is not None and data.wiki_structure.title == "legacy"
    # The concise variant never used the legacy name.
    assert (
        await wio.read_wiki_cache(
            "octo", "my_repo", "github", "en", comprehensive=False
        )
        is None
    )


@pytest.mark.asyncio
async def test_new_name_wins_over_legacy(cache_dir):
    await _write_legacy(cache_dir)
    assert await wio.save_wiki_cache("octo", "my_repo", "github", "en", _cache("new"))
    data = await wio.read_wiki_cache("octo", "my_repo", "github", "en")
    assert data.wiki_structure.title == "new"


@pytest.mark.asyncio
async def test_delete_removes_legacy_cache(cache_dir):
    legacy = await _write_legacy(cache_dir)
    assert not await wio.delete_wiki_cache(
        "octo", "my_repo", "github", "en", comprehensive=False
    )
    assert legacy.exists()
    assert await wio.delete_wiki_cache("octo", "my_repo", "github", "en")
    assert not legacy.exists()
    assert not wio.wiki_cache_exists("octo", "my_repo", "github", "en")


@pytest.mark.asyncio
async def test_delete_removes_both_new_and_legacy(cache_dir):
    legacy = await _write_legacy(cache_dir)
    await wio.save_wiki_cache("octo", "my_repo", "github", "en", _cache("new"))
    assert await wio.delete_wiki_cache("octo", "my_repo", "github", "en")
    assert not legacy.exists()
    assert os.listdir(cache_dir) == []


@pytest.mark.asyncio
async def test_list_does_not_duplicate_a_superseded_legacy_cache(cache_dir):
    await _write_legacy(cache_dir)
    entries = await wio.list_wiki_cache()
    assert [(e.owner, e.repo, e.language) for e in entries] == [
        ("octo", "my_repo", "en")
    ]

    await wio.save_wiki_cache("octo", "my_repo", "github", "en", _cache("new"))
    await wio.save_wiki_cache(
        "octo", "my_repo", "github", "en", _cache("c"), comprehensive=False
    )
    entries = await wio.list_wiki_cache()
    assert sorted(e.id for e in entries) == [
        "deepwiki_cache_github_octo_my_repo_en_comprehensive.json",
        "deepwiki_cache_github_octo_my_repo_en_concise.json",
    ]

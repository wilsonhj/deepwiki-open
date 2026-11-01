"""Regression tests for repository path resolution.

Every case here failed before the fix: `read_repo_file` anchored its traversal
guard on `local_repo_dir(repo_url, ...)`, which returned a non-URL `repo_url`
verbatim. The attacker therefore chose the root the guard compared against, so
`GET /codemap/file?repo_url=/&file_path=etc/passwd&type=local` read any file the
process could open.
"""

import os

import pytest

from api.repository import CLONE_REPO_ROOT, Repo, path_within
from api.services.codemap import local_repo_dir, read_repo_file


@pytest.mark.parametrize(
    "repo_url, repo_type, file_path",
    [
        ("/", "local", "etc/passwd"),
        ("/etc", "github", "passwd"),
        ("/etc", "local", "shadow"),
        ("/proc/self", "local", "environ"),
        ("/root", "local", ".ssh/id_rsa"),
        # An absolute file_path makes os.path.join discard the repo dir entirely.
        ("/tmp", "local", "/etc/passwd"),
    ],
)
def test_local_paths_are_refused(monkeypatch, repo_url, repo_type, file_path):
    monkeypatch.delenv("DEEPWIKI_LOCAL_REPO_ROOTS", raising=False)
    with pytest.raises((ValueError, FileNotFoundError)):
        read_repo_file(repo_url, repo_type, file_path)


def test_traversal_out_of_a_cloned_repo_is_refused(monkeypatch, tmp_path):
    """`..` must not escape even when the repo root is one we chose."""
    monkeypatch.setenv("DEEPWIKI_LOCAL_REPO_ROOTS", str(tmp_path))
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "ok.txt").write_text("inside")
    (tmp_path / "secret.txt").write_text("outside")

    assert read_repo_file(str(repo), "local", "ok.txt") == "inside"
    with pytest.raises(ValueError):
        read_repo_file(str(repo), "local", "../secret.txt")


def test_local_root_allowlist_opt_in(monkeypatch, tmp_path):
    """Local repos work only once an operator names the roots explicitly."""
    (tmp_path / "README.md").write_text("hi")

    monkeypatch.delenv("DEEPWIKI_LOCAL_REPO_ROOTS", raising=False)
    with pytest.raises(ValueError):
        read_repo_file(str(tmp_path), "local", "README.md")

    monkeypatch.setenv("DEEPWIKI_LOCAL_REPO_ROOTS", str(tmp_path))
    assert read_repo_file(str(tmp_path), "local", "README.md") == "hi"


def test_allowlist_does_not_admit_siblings(monkeypatch, tmp_path):
    """A prefix match must not let /srv/repos-evil through for /srv/repos."""
    allowed = tmp_path / "repos"
    allowed.mkdir()
    sibling = tmp_path / "repos-evil"
    sibling.mkdir()
    (sibling / "README.md").write_text("nope")

    monkeypatch.setenv("DEEPWIKI_LOCAL_REPO_ROOTS", str(allowed))
    with pytest.raises(ValueError):
        read_repo_file(str(sibling), "local", "README.md")


def test_codemap_reads_where_the_clone_actually_landed():
    """The codemap file viewer and the clone must agree on the directory.

    They disagreed on both the parent ("repos" vs "repo") and the naming rules,
    so every remote repository resolved to a path that does not exist.
    """
    url = "https://github.com/AsyncFuncAI/deepwiki-open"
    assert local_repo_dir(url, "github") == Repo(url, "github").save_path


def test_clone_dir_cannot_collide_with_the_pickle_directory():
    """A repo named "databases" must not land on the vector-store directory.

    Those pickles are fed to pickle.load, so cloning attacker-controlled content
    over that directory is a code-execution primitive.
    """
    from api.rag.pipeline import get_repo_db

    db_dir = os.path.dirname(get_repo_db(Repo("https://evil.com/payload", "github")))
    clone_dir = Repo("https://evil.com/databases", "github").save_path
    assert db_dir != clone_dir
    assert not path_within(clone_dir, db_dir)


def test_clone_dirs_are_host_specific():
    """Same owner/repo on a different host must not share a clone directory."""
    genuine = Repo("https://github.com/facebook/react", "github").save_path
    impostor = Repo("https://evil.com/facebook/react", "github").save_path
    assert genuine != impostor
    assert path_within(genuine, CLONE_REPO_ROOT)
    assert path_within(impostor, CLONE_REPO_ROOT)


def _symlinked_repo(tmp_path):
    """A repo whose files include symlinks pointing outside of it."""
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.md").write_text("HOST SECRET")
    (outside / "dir").mkdir()
    (outside / "dir" / "inner.md").write_text("HOST SECRET")

    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "README.md").write_text("real readme")
    (repo / "main.py").write_text("print('hi')")
    (repo / "env.md").symlink_to(outside / "secret.md")
    (repo / "linked").symlink_to(outside / "dir", target_is_directory=True)
    # Even a link to a file inside the repo is skipped: links are never needed
    # to index a repo and following them is how host files get pulled in.
    (repo / "alias.py").symlink_to(repo / "main.py")
    return repo


def test_iterate_files_skips_symlinks_out_of_the_repo(tmp_path, exclude_test_config):
    from api.config import iterate_files

    repo = _symlinked_repo(tmp_path)
    files = iterate_files(str(repo))
    assert sorted(files) == ["README.md", "main.py"]


def test_read_repo_file_tree_does_not_read_a_symlinked_readme(
    tmp_path, exclude_test_config
):
    from api.services.wiki.structure import read_repo_file_tree

    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.md").write_text("HOST SECRET")
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "README.md").symlink_to(outside / "secret.md")
    (repo / "main.py").write_text("x = 1")

    files, readme = read_repo_file_tree(str(repo))
    assert files == ["main.py"]
    assert "HOST SECRET" not in readme


def test_local_repo_structure_skips_symlinks(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient

    from api.main import app

    repo = _symlinked_repo(tmp_path)
    (repo / "README.md").unlink()
    (repo / "README.md").symlink_to(tmp_path / "outside" / "secret.md")
    monkeypatch.setenv("DEEPWIKI_LOCAL_REPO_ROOTS", str(repo))

    resp = TestClient(app).get("/local_repo/structure", params={"path": str(repo)})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "HOST SECRET" not in resp.text
    assert body["file_tree"].split("\n") == ["main.py"]

#!/usr/bin/env python3
"""
Focused test script for the _extract_repo_name_from_url method

Run this script to test only the repository name extraction functionality.
Usage: python test_extract_repo_name.py
"""

import os

import pytest

from api.repository import CLONE_REPO_ROOT, Repo


class TestExtractRepoNameFromUrl:
    """Comprehensive tests for the _extract_repo_name_from_url method"""

    @pytest.mark.parametrize(
        "repo_url, name",
        [
            ("https://github.com/owner/repo", "owner_repo"),
            ("https://github.com/owner/repo.git", "owner_repo"),
            ("https://github.com/owner/repo/", "owner_repo"),
            ("https://github.com/repo", "repo"),
        ],
    )
    def test_extract_repo_name_github_standard_url(self, repo_url, name):
        # Test standard GitHub URL
        repo = Repo(repo_url=repo_url, repo_type="github")
        assert repo.name == name
        assert not repo.is_local

    @pytest.mark.parametrize(
        "repo_url, name",
        [
            ("https://gitlab.com/owner/repo", "owner_repo"),
            ("https://gitlab.com/group/subgroup/repo", "subgroup_repo"),
        ],
    )
    def test_extract_repo_name_gitlab_urls(self, repo_url, name):
        """Test repository name extraction from GitLab URLs"""

        repo = Repo(repo_url=repo_url, repo_type="gitlab")
        assert repo.name == name
        assert not repo.is_local

    def test_extract_repo_name_bitbucket_urls(self):
        """Test repository name extraction from Bitbucket URLs"""
        repo = Repo(repo_url="https://bitbucket.org/owner/repo", repo_type="bitbucket")
        assert repo.name == "owner_repo"
        assert not repo.is_local

    @pytest.mark.parametrize(
        "repo_url, name",
        [
            ("/home/user/projects/my-repo", "my-repo"),
            ("/var/repos/project.git", "project.git"),
            ("my-repo", "my-repo"),
        ],
    )
    def test_extract_repo_name_local_paths(self, repo_url, name):
        """Test repository name extraction from local paths"""
        repo = Repo(repo_url=repo_url, repo_type="local")
        assert repo.name == name
        assert repo.is_local


@pytest.mark.parametrize(
    "url, repo_type, prefix",
    [
        ("https://github.com/owner/repo", "github", "owner_repo-"),
        (
            "https://github.com/AsyncFuncAI/deepwiki-open",
            "github",
            "AsyncFuncAI_deepwiki-open-",
        ),
    ],
)
def test_save_dir(url, repo_type, prefix):
    """Clones live under CLONE_REPO_ROOT, in a directory tagged with a URL digest."""
    save_path = Repo(repo_url=url, repo_type=repo_type).save_path
    assert os.path.dirname(save_path) == CLONE_REPO_ROOT
    assert os.path.basename(save_path).startswith(prefix)


def test_save_dir_is_host_specific():
    """Two repos differing only by host must not share a clone directory.

    The name is built from the last two URL path segments with the host
    discarded, so https://evil.com/facebook/react and
    https://github.com/facebook/react both produce the name "facebook_react".
    Whoever indexed first would otherwise own that directory for everyone.
    """
    genuine = Repo("https://github.com/facebook/react", "github").save_path
    impostor = Repo("https://evil.com/facebook/react", "github").save_path
    assert genuine != impostor


def test_repo_name_does_not_mangle_dot_git_substring():
    """`.git` is a suffix to strip, not a substring to delete."""
    assert Repo("https://github.com/acme/acme.github.io", "github").name == (
        "acme_acme.github.io"
    )
    # ...and so must not collide with a genuinely different repository.
    assert (
        Repo("https://github.com/acme/acme.github.io", "github").save_path
        != Repo("https://github.com/acme/acmehub.io", "github").save_path
    )

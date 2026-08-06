"""Authorization enforcement for the DeepWiki API.

`WIKI_AUTH_MODE` used to gate exactly one endpoint (`DELETE /api/wiki_cache`)
while every other route — chat, codemap, repo indexing, wiki reads — stayed
open. The frontend's `POST /auth/validate` call is advisory: it returns a
boolean and issues no session, so calling the backend directly bypassed it.

`require_auth` centralises the check so it can be applied to every non-public
route. When `WIKI_AUTH_MODE` is off (the default) it is a no-op, so existing
deployments are unaffected.
"""

import hmac
from typing import Optional

from fastapi import HTTPException, Query

from api.config import WIKI_AUTH_CODE, WIKI_AUTH_MODE
from api.logger import get_logger

logger = get_logger(__name__)


def auth_code_valid(code: Optional[str]) -> bool:
    """Constant-time check of a supplied authorization code.

    An empty configured code is treated as misconfiguration rather than as a
    credential that anything can match — previously `/auth/validate` accepted
    `{"code": ""}` when `DEEPWIKI_AUTH_CODE` was unset, which opened the
    frontend gate.
    """
    if not WIKI_AUTH_MODE:
        return True
    if not WIKI_AUTH_CODE:
        logger.error(
            "DEEPWIKI_AUTH_MODE is enabled but DEEPWIKI_AUTH_CODE is empty; "
            "refusing all authorization attempts."
        )
        return False
    if not code:
        return False
    return hmac.compare_digest(WIKI_AUTH_CODE, code)


async def require_auth(
    authorization_code: Optional[str] = Query(
        None, description="Authorization code (required when auth mode is enabled)"
    ),
) -> None:
    """FastAPI dependency enforcing the wiki authorization code."""
    if not WIKI_AUTH_MODE:
        return
    if not auth_code_valid(authorization_code):
        raise HTTPException(status_code=401, detail="Authorization code is invalid")


def websocket_auth_valid(payload: dict) -> bool:
    """Authorization check for WebSocket handshakes, which carry no query dep."""
    if not WIKI_AUTH_MODE:
        return True
    return auth_code_valid(payload.get("authorization_code"))

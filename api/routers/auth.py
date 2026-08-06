from fastapi import APIRouter

from api.auth import auth_code_valid
from api.config import WIKI_AUTH_MODE
from api.schemas import AuthorizationConfig

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/status")
async def get_auth_status():
    """
    Check if authentication is required for the wiki.
    """
    return {"auth_required": WIKI_AUTH_MODE}


@router.post("/validate")
async def validate_auth_code(request: AuthorizationConfig):
    """
    Check authorization code.
    """
    # Constant-time, and an unset DEEPWIKI_AUTH_CODE no longer matches "".
    return {"success": auth_code_valid(request.code)}

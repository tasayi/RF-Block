"""
Health check & status API route.
"""

from fastapi import APIRouter
import skrf as skrf
from ... import __version__

router = APIRouter(tags=["Health"])

@router.get("/status")
async def get_status():
    return {
        "status": "online",
        "version": __version__,
        "skrf_version": skrf.__version__
    }

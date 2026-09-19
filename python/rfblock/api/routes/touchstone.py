"""
Touchstone Export REST Route.
"""

from fastapi import APIRouter, Response, HTTPException
from ..schemas.schematic import SchematicPayload
from ...physics.touchstone import generate_touchstone_s2p

router = APIRouter(tags=["Touchstone"])

@router.post("/export/touchstone")
async def export_touchstone(payload: SchematicPayload):
    try:
        schematic = payload.model_dump()
        s2p_text = generate_touchstone_s2p(schematic)
        return Response(
            content=s2p_text,
            media_type="text/plain",
            headers={"Content-Disposition": "attachment; filename=circuit.s2p"}
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


"""
S-Parameter Matrix Analysis REST Route.
"""

from fastapi import APIRouter, HTTPException
from ..schemas.schematic import SchematicPayload
from ...physics.cascade import analyze_schematic_cascade

router = APIRouter(tags=["S-Parameters"])

@router.post("/analyze/sparams")
async def analyze_sparams(payload: SchematicPayload):
    try:
        schematic = payload.model_dump()
        result = analyze_schematic_cascade(schematic)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


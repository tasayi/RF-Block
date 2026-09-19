"""
Pydantic data models for RFBlock request validation.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

class AnalysisBand(BaseModel):
    startFreq: float = Field(default=1.0, ge=0.0)
    stopFreq: float = Field(default=10.0, ge=0.0)
    startUnit: str = Field(default="GHz")
    stopUnit: str = Field(default="GHz")
    points: int = Field(default=101, ge=2, le=2001)
    sweepType: str = Field(default="lin")

class SchematicPayload(BaseModel):
    band: Optional[AnalysisBand] = Field(default_factory=AnalysisBand)
    blocks: List[Dict[str, Any]] = Field(default_factory=list)
    conns: List[Dict[str, Any]] = Field(default_factory=list)


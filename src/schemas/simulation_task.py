from pydantic import BaseModel, Field
from datetime import datetime
from typing import Any, Optional


class SimulationTaskBase(BaseModel):
    task_name: str = Field(..., min_length=1, max_length=120)
    map_id: Optional[str] = None
    status: str = "created"
    note: Optional[str] = None
    code_text: Optional[str] = None
    parameters: dict[str, Any] = Field(default_factory=dict)
    records: list[dict[str, Any]] = Field(default_factory=list)
    result: dict[str, Any] = Field(default_factory=dict)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class SimulationTaskCreate(SimulationTaskBase):
    pass


class SimulationTaskUpdate(BaseModel):
    task_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    map_id: Optional[str] = None
    status: Optional[str] = None
    note: Optional[str] = None
    code_text: Optional[str] = None
    parameters: Optional[dict[str, Any]] = None
    records: Optional[list[dict[str, Any]]] = None
    result: Optional[dict[str, Any]] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class SimulationTaskSnapshot(BaseModel):
    status: str = "completed"
    map_id: Optional[str] = None
    code_text: Optional[str] = None
    parameters: dict[str, Any] = Field(default_factory=dict)
    records: list[dict[str, Any]] = Field(default_factory=list)
    result: dict[str, Any] = Field(default_factory=dict)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class SimulationTaskResponse(SimulationTaskBase):
    id: int
    user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from src.models import SimulationTask, User
from src.schemas import SimulationTaskCreate, SimulationTaskUpdate, SimulationTaskSnapshot, SimulationTaskResponse

router = APIRouter(prefix="/api/simulation/tasks", tags=["仿真任务"])
optional_security = HTTPBearer(auto_error=False)


def _json_dumps(value) -> str:
    return json.dumps(value if value is not None else {}, ensure_ascii=False)


def _json_loads(value: str, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except Exception:
        return fallback


async def get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if credentials is None:
        return None
    try:
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username = payload.get("sub")
        if not username:
            return None
        return db.query(User).filter(User.username == username, User.is_active == True).first()
    except JWTError:
        return None


def task_to_response(task: SimulationTask) -> SimulationTaskResponse:
    return SimulationTaskResponse(
        id=task.id,
        user_id=task.user_id,
        task_name=task.task_name,
        map_id=task.map_id,
        status=task.status,
        note=task.note,
        code_text=task.code_text,
        parameters=_json_loads(task.parameters_json, {}),
        records=_json_loads(task.records_json, []),
        result=_json_loads(task.result_json, {}),
        started_at=task.started_at,
        finished_at=task.finished_at,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def query_visible_task(db: Session, task_id: int, current_user: Optional[User]) -> SimulationTask:
    query = db.query(SimulationTask).filter(SimulationTask.id == task_id)
    if current_user is not None:
        query = query.filter((SimulationTask.user_id == current_user.id) | (SimulationTask.user_id.is_(None)))
    task = query.first()
    if task is None:
        raise HTTPException(status_code=404, detail="仿真任务不存在")
    return task


@router.get("", response_model=list[SimulationTaskResponse])
async def list_tasks(
    status: Optional[str] = Query(default=None),
    map_id: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    query = db.query(SimulationTask)
    if current_user is not None:
        query = query.filter((SimulationTask.user_id == current_user.id) | (SimulationTask.user_id.is_(None)))
    if status:
        query = query.filter(SimulationTask.status == status)
    if map_id:
        query = query.filter(SimulationTask.map_id == map_id)
    tasks = query.order_by(SimulationTask.updated_at.desc()).limit(limit).all()
    return [task_to_response(task) for task in tasks]


@router.post("", response_model=SimulationTaskResponse)
async def create_task(
    payload: SimulationTaskCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    now = datetime.utcnow()
    task = SimulationTask(
        user_id=current_user.id if current_user else None,
        task_name=payload.task_name,
        map_id=payload.map_id,
        status=payload.status or "created",
        note=payload.note,
        code_text=payload.code_text,
        parameters_json=_json_dumps(payload.parameters),
        records_json=json.dumps(payload.records or [], ensure_ascii=False),
        result_json=_json_dumps(payload.result),
        started_at=payload.started_at,
        finished_at=payload.finished_at,
        created_at=now,
        updated_at=now,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task_to_response(task)


@router.get("/{task_id}", response_model=SimulationTaskResponse)
async def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    return task_to_response(query_visible_task(db, task_id, current_user))


@router.patch("/{task_id}", response_model=SimulationTaskResponse)
async def update_task(
    task_id: int,
    payload: SimulationTaskUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    task = query_visible_task(db, task_id, current_user)
    data = payload.model_dump(exclude_unset=True)
    for field in ["task_name", "map_id", "status", "note", "code_text", "started_at", "finished_at"]:
        if field in data:
            setattr(task, field, data[field])
    if "parameters" in data:
        task.parameters_json = _json_dumps(data["parameters"])
    if "records" in data:
        task.records_json = json.dumps(data["records"] or [], ensure_ascii=False)
    if "result" in data:
        task.result_json = _json_dumps(data["result"])
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task_to_response(task)


@router.post("/{task_id}/snapshot", response_model=SimulationTaskResponse)
async def save_task_snapshot(
    task_id: int,
    payload: SimulationTaskSnapshot,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    task = query_visible_task(db, task_id, current_user)
    task.status = payload.status
    task.map_id = payload.map_id or task.map_id
    task.code_text = payload.code_text
    task.parameters_json = _json_dumps(payload.parameters)
    task.records_json = json.dumps(payload.records or [], ensure_ascii=False)
    task.result_json = _json_dumps(payload.result)
    task.started_at = payload.started_at or task.started_at
    task.finished_at = payload.finished_at or datetime.utcnow()
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task_to_response(task)


@router.delete("/{task_id}")
async def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    task = query_visible_task(db, task_id, current_user)
    db.delete(task)
    db.commit()
    return {"success": True, "id": task_id}

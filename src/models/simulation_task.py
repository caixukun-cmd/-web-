from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from datetime import datetime
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from database import Base


class SimulationTask(Base):
    __tablename__ = "simulation_tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    task_name = Column(String, nullable=False)
    map_id = Column(String, nullable=True, index=True)
    status = Column(String, nullable=False, default="created", index=True)
    note = Column(Text, nullable=True)
    code_text = Column(Text, nullable=True)
    parameters_json = Column(Text, nullable=False, default="{}")
    records_json = Column(Text, nullable=False, default="[]")
    result_json = Column(Text, nullable=False, default="{}")
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

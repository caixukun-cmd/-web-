"""
WebSocket端点 - 第一引擎
包含 WebSocket 和 REST API 端点
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import sys
import os
import asyncio
import json

# 添加项目根目录到Python路径
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

from src.utils.engine1.session import Engine1Session
from src.utils.simulator import get_demo_track_with_checksum, get_available_maps, get_track_by_id

router = APIRouter()

# 存储活跃的WebSocket连接
active_connections: Set[WebSocket] = set()

# 每个连接对应的会话
sessions: Dict[WebSocket, Engine1Session] = {}


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket端点 - 纯粹的通信层
    职责：
    - 接受连接
    - 创建EngineSession实例
    - 转发消息给会话处理
    - 断开连接时清理资源
    """
    await websocket.accept()
    active_connections.add(websocket)

    async def send_message(data: dict):
        try:
            if websocket in active_connections:
                await websocket.send_json(data)
        except Exception as e:
            print(f"发送消息时发生错误: {e}")
            active_connections.discard(websocket)

    # 创建并启动会话
    session = Engine1Session(websocket, send_message)
    sessions[websocket] = session
    await session.start()

    try:
        await websocket.send_json({'type': 'log', 'message': 'WebSocket连接成功', 'level': 'success'})

        while True:
            data = await websocket.receive_text()
            # 将消息处理完全委托给会话
            await session.handle_message(data)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket错误: {e}")
        import traceback
        traceback.print_exc()
    finally:
        active_connections.discard(websocket)
        # 清理会话资源 - 使用任务异步清理
        if websocket in sessions:
            # 创建任务来异步清理，避免在finally中await
            asyncio.create_task(sessions[websocket].cleanup())
            del sessions[websocket]


@router.get("/ws/status")
async def websocket_status():
    return {
        "active_connections": len(active_connections),
        "status": "running"
    }


@router.get("/api/track/demo")
async def get_demo_track_api():
    """获取演示轨道数据（前端用于渲染，带校验信息）"""
    return get_demo_track_with_checksum()


@router.get("/api/maps")
async def get_maps_api():
    """获取可用地图列表（供前端下拉框使用）"""
    return {
        'maps': get_available_maps()
    }


@router.get("/api/maps/{map_id}")
async def get_map_by_id_api(map_id: str):
    """获取指定ID的地图数据"""
    return get_track_by_id(map_id)


# 保留原来的 /ws/engine1 端点，以便未来扩展
@router.websocket("/ws/engine1")
async def websocket_engine1_endpoint(websocket: WebSocket):
    """
    WebSocket端点 - 纯粹的通信层（第一引擎新端点）
    职责：
    - 接受连接
    - 创建EngineSession实例
    - 转发消息给会话处理
    - 断开连接时清理资源
    """
    await websocket.accept()
    active_connections.add(websocket)

    async def send_message(data: dict):
        try:
            if websocket in active_connections:
                await websocket.send_json(data)
        except Exception as e:
            print(f"发送消息时发生错误: {e}")
            active_connections.discard(websocket)

    # 创建并启动会话
    session = Engine1Session(websocket, send_message)
    sessions[websocket] = session
    await session.start()

    try:
        await websocket.send_json({'type': 'log', 'message': '第一引擎WebSocket连接成功', 'level': 'success'})

        while True:
            data = await websocket.receive_text()
            # 将消息处理完全委托给会话
            await session.handle_message(data)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket错误: {e}")
        import traceback
        traceback.print_exc()
    finally:
        active_connections.discard(websocket)
        # 清理会话资源 - 使用任务异步清理
        if websocket in sessions:
            # 创建任务来异步清理，避免在finally中await
            asyncio.create_task(sessions[websocket].cleanup())
            del sessions[websocket]


@router.get("/ws/engine1/status")
async def websocket_engine1_status():
    return {
        "active_connections": len(active_connections),
        "status": "running"
    }
"""
WebSocket路由 - 处理实时通信
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

from src.utils import CarSimulator
from src.utils import CodeSandbox

router = APIRouter()

# 存储活跃的WebSocket连接
active_connections: Set[WebSocket] = set()

# 每个连接对应的仿真器
simulators: Dict[WebSocket, CarSimulator] = {}


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.add(websocket)

    simulator = CarSimulator()
    simulators[websocket] = simulator

    async def send_message(data: dict):
        try:
            if websocket in active_connections:
                await websocket.send_json(data)
        except Exception as e:
            print(f"发送消息时发生错误: {e}")
            active_connections.discard(websocket)

    sandbox = CodeSandbox(simulator.car, send_message, simulator)

    simulator_task = asyncio.create_task(simulator.start())
    broadcast_task = None
    code_execution_task = None  # 新增：用户代码执行 task

    async def start_broadcast():
        nonlocal broadcast_task
        if broadcast_task and not broadcast_task.done():
            broadcast_task.cancel()
            try:
                await broadcast_task
            except asyncio.CancelledError:
                pass

        async def broadcast_state():
            while websocket in active_connections:
                try:
                    state = simulator.get_state()
                    await websocket.send_json({
                        'type': 'position',
                        'x': state['x'],
                        'y': state['y'],
                        'rotation': state['rotation']
                    })
                    await websocket.send_json({
                        'type': 'status',
                        'speed': state['speed'],
                        'is_moving': state['is_moving']
                    })
                    await asyncio.sleep(0.1)
                except Exception as e:
                    print(f"广播状态时发生错误: {e}")
                    break

        broadcast_task = asyncio.create_task(broadcast_state())

    await start_broadcast()

    try:
        await websocket.send_json({'type': 'log', 'message': 'WebSocket连接成功', 'level': 'success'})

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get('type')

            if msg_type == 'run_code':
                simulator.start_code_execution()
                code = message.get('code', '')
                if code:
                    await websocket.send_json({'type': 'log', 'message': '开始执行代码...', 'level': 'info'})

                    # 关键：先取消旧的执行任务（防止重复运行）
                    if code_execution_task and not code_execution_task.done():
                        code_execution_task.cancel()
                        try:
                            await code_execution_task
                        except asyncio.CancelledError:
                            pass

                    # 在后台运行 execute，不阻塞主循环
                    code_execution_task = asyncio.create_task(sandbox.execute(code))

                simulator.end_code_execution()

            elif msg_type == 'stop':
                print(f"[WS] 收到 stop 命令，开始强制处理...")

                # 立即取消用户代码执行（打断 await wait/sleep）
                if code_execution_task and not code_execution_task.done():
                    code_execution_task.cancel()
                    try:
                        await code_execution_task
                    except asyncio.CancelledError:
                        print(f"[WS] 用户代码 task 已取消 (stop)")

                # 暂停广播（防止旧位置覆盖）
                if broadcast_task and not broadcast_task.done():
                    broadcast_task.cancel()
                    try:
                        await broadcast_task
                    except asyncio.CancelledError:
                        pass

                # 停止仿真循环
                if simulator_task and not simulator_task.done():
                    simulator_task.cancel()
                    try:
                        await simulator_task
                    except asyncio.CancelledError:
                        pass

                # 停止处理
                sandbox.car_api._stopped = True
                simulator.car.stop()
                simulator.car.current_speed = 0.0
                simulator.car.target_speed = 0.0
                simulator.car.motion_duration = 0.0
                simulator.car.is_moving = False

                await websocket.send_json({
                    'type': 'log',
                    'message': '已强制停止代码执行和小车运动',
                    'level': 'success'
                })

                # 发送禁用循线消息（避免残留）
                await websocket.send_json({
                    'type': 'line_disable'
                })

                # 立即广播当前状态（让前端尽快静止）
                state = simulator.get_state()
                await websocket.send_json({
                    'type': 'position',
                    'x': state['x'],
                    'y': state['y'],
                    'rotation': state['rotation']
                })
                await websocket.send_json({
                    'type': 'status',
                    'speed': 0.0,
                    'is_moving': False
                })

                # 缓冲后重启
                await asyncio.sleep(0.8)  # 防闪烁缓冲

                simulator_task = asyncio.create_task(simulator.start())
                await start_broadcast()

            elif msg_type == 'home':
                print(f"[WS] 收到 home 命令，开始归位...")

                # 检查是否有代码正在执行
                if code_execution_task and not code_execution_task.done():
                    await websocket.send_json({
                        'type': 'log',
                        'message': '请先停止代码执行后再归位',
                        'level': 'warning'
                    })
                    continue

                # 暂停广播（防止旧位置覆盖）
                if broadcast_task and not broadcast_task.done():
                    broadcast_task.cancel()
                    try:
                        await broadcast_task
                    except asyncio.CancelledError:
                        pass

                # 停止仿真循环
                if simulator_task and not simulator_task.done():
                    simulator_task.cancel()
                    try:
                        await simulator_task
                    except asyncio.CancelledError:
                        pass

                # 归位处理：重置小车到初始位置和状态
                simulator.reset()
                simulator.car.stop()
                simulator.car.current_speed = 0.0
                simulator.car.target_speed = 0.0
                simulator.car.motion_duration = 0.0
                simulator.car.is_moving = False

                await websocket.send_json({
                    'type': 'log',
                    'message': '小车已归位到初始位置',
                    'level': 'success'
                })

                # 发送禁用循线消息（避免残留）
                await websocket.send_json({
                    'type': 'line_disable'
                })

                # 立即广播归位后的状态
                state = simulator.get_state()
                await websocket.send_json({
                    'type': 'position',
                    'x': state['x'],
                    'y': state['y'],
                    'rotation': state['rotation']
                })
                await websocket.send_json({
                    'type': 'status',
                    'speed': 0.0,
                    'is_moving': False
                })

                # 重启仿真循环和广播
                await asyncio.sleep(0.1)  # 短暂延迟确保状态更新
                simulator_task = asyncio.create_task(simulator.start())
                await start_broadcast()

                # 再次发送位置确认，确保前端正确显示
                await websocket.send_json({
                    'type': 'position',
                    'x': state['x'],
                    'y': state['y'],
                    'rotation': state['rotation']
                })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket错误: {e}")
        import traceback
        traceback.print_exc()
    finally:
        active_connections.discard(websocket)
        simulator.stop()
        if simulator_task and not simulator_task.done():
            simulator_task.cancel()
        if broadcast_task and not broadcast_task.done():
            broadcast_task.cancel()
        if code_execution_task and not code_execution_task.done():
            code_execution_task.cancel()
        if websocket in simulators:
            del simulators[websocket]
        if hasattr(sandbox, 'car_api'):
            sandbox.car_api._stopped = False  # 下次运行重置标志


@router.get("/ws/status")
async def websocket_status():
    return {
        "active_connections": len(active_connections),
        "status": "running"
    }
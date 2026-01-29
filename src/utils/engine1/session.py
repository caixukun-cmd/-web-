"""
第一引擎会话管理器
负责管理 simulator、sandbox、地图加载等业务逻辑
"""
import asyncio
import json
import sys
import os
import time
from typing import Dict, Set, Optional, Callable

# 添加项目根目录到Python路径
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
grandparent_dir = os.path.dirname(parent_dir)
sys.path.insert(0, grandparent_dir)

from src.utils.simulator import get_demo_track, get_demo_track_with_checksum, get_available_maps, get_track_by_id
from src.utils.sandbox import CodeSandbox
from src.utils.engine1.protocol import PROTOCOL_ROUTER


class Engine1Session:
    def __init__(self, websocket, send_message_func: Callable):
        """
        初始化会话
        
        Args:
            websocket: WebSocket连接对象
            send_message_func: 发送消息的回调函数
        """
        self.websocket = websocket
        self.send_message = send_message_func
        self.simulator = None
        self.sandbox = None
        self.code_execution_task = None
        
        # 任务管理
        self.simulator_task = None
        self.broadcast_task = None
        
        # 初始化 simulator 和 sandbox
        from src.utils.simulator import CarSimulator
        self.simulator = CarSimulator()
        self.sandbox = CodeSandbox(self.simulator.car, self.send_message, self.simulator)
        
        # 在初始化时加载默认地图
        demo_track = get_demo_track()
        self.simulator.car.load_track_data(demo_track)
        print(f"[Session] 默认轨道已加载到模拟器: {len(self.simulator.car.track_waypoints)} 个路径点")
        
        # 初始化时也设置当前地图ID为easy
        self.simulator.car.current_map_id = 'easy'

    async def start(self):
        """启动会话，启动仿真和广播任务"""
        # 启动仿真器
        self.simulator_task = asyncio.create_task(self.simulator.start())
        
        # 启动状态广播
        self.broadcast_task = asyncio.create_task(self.push_loop())

    async def push_loop(self):
        """状态推送循环"""
        while True:  # 在WebSocket断开时，外层的try-except-finally会处理
            try:
                state = self.simulator.get_state()
                # 保持与原有协议相同的字段
                await self.send_message({
                    'type': 'position',
                    'x': state['x'],
                    'y': state['y'],
                    'rotation': state['rotation']
                })
                await self.send_message({
                    'type': 'status',
                    'speed': state['speed'],
                    'is_moving': state['is_moving']
                })
                # 保持原有的更新频率
                await asyncio.sleep(0.1)
            except Exception as e:
                print(f"推送状态时发生错误: {e}")
                break

    async def handle_message(self, message_str: str):
        """处理接收到的消息 - 通过协议路由"""
        # 使用协议路由器处理消息
        success = await PROTOCOL_ROUTER.route_message(self, message_str)
        if not success:
            print(f"消息处理失败: {message_str[:100]}...")

    async def _handle_run_code(self, message: dict):
        """处理运行代码请求"""
        self.simulator.start_code_execution()
        code = message.get('code', '')
        if code:
            await self.send_message({'type': 'log', 'message': '开始执行代码...', 'level': 'info'})
    
            # 关键：先取消旧的执行任务（防止重复运行）
            if self.code_execution_task and not self.code_execution_task.done():
                self.code_execution_task.cancel()
                try:
                    await self.code_execution_task
                except asyncio.CancelledError:
                    pass
    
            # 在后台运行 execute，不阻塞主循环
            self.code_execution_task = asyncio.create_task(self.sandbox.execute(code))
    
        self.simulator.end_code_execution()

    async def _handle_stop(self):
        """处理停止请求"""
        print(f"[Session] 收到 stop 命令，开始强制处理...")

        # 立即取消用户代码执行（打断 await wait/sleep）
        if self.code_execution_task and not self.code_execution_task.done():
            self.code_execution_task.cancel()
            try:
                await self.code_execution_task
            except asyncio.CancelledError:
                print(f"[Session] 用户代码 task 已取消 (stop)")

        # 暂停广播（防止旧位置覆盖）
        if self.broadcast_task and not self.broadcast_task.done():
            self.broadcast_task.cancel()
            try:
                await self.broadcast_task
            except asyncio.CancelledError:
                pass

        # 停止仿真循环
        if self.simulator_task and not self.simulator_task.done():
            self.simulator_task.cancel()
            try:
                await self.simulator_task
            except asyncio.CancelledError:
                pass

        # 停止处理
        if self.sandbox.car_api:
            self.sandbox.car_api._stopped = True
        self.simulator.car.stop()
        self.simulator.car.current_speed = 0.0
        self.simulator.car.target_speed = 0.0
        self.simulator.car.motion_duration = 0.0
        self.simulator.car.is_moving = False

        await self.send_message({
            'type': 'log',
            'message': '已强制停止代码执行和小车运动',
            'level': 'success'
        })

        # 发送禁用循线消息（避免残留）
        await self.send_message({
            'type': 'line_disable'
        })

        # 立即广播当前状态（让前端尽快静止）
        state = self.simulator.get_state()
        await self.send_message({
            'type': 'position',
            'x': state['x'],
            'y': state['y'],
            'rotation': state['rotation']
        })
        await self.send_message({
            'type': 'status',
            'speed': 0.0,
            'is_moving': False
        })

        # 缓冲后重启
        await asyncio.sleep(0.8)  # 防闪烁缓冲

        self.simulator_task = asyncio.create_task(self.simulator.start())
        # 重启广播任务
        if self.broadcast_task and not self.broadcast_task.done():
            self.broadcast_task.cancel()
            try:
                await self.broadcast_task
            except asyncio.CancelledError:
                pass
        self.broadcast_task = asyncio.create_task(self.push_loop())

    async def _handle_get_maps(self):
        """处理获取地图列表请求"""
        # 前端请求获取可用地图列表
        maps = get_available_maps()
        await self.send_message({
            'type': 'maps_list',
            'maps': maps
        })
        print(f"[Session] 返回地图列表: {len(maps)} 个地图")

    async def _handle_select_map(self, message: dict):
        """处理选择地图请求"""
        # 前端选择了某个地图
        map_id = message.get('mapId', 'easy')
        print(f"[Session] 收到地图选择: {map_id}")
        
        # 记忆用户选择的地图ID
        self.simulator.car.current_map_id = map_id
        
        # 加载地图数据
        track_data = get_track_by_id(map_id)
        
        # 同时加载到后端仿真器
        self.simulator.car.load_track_data(track_data)
        
        # 返回地图数据给前端
        await self.send_message({
            'type': 'track_data',
            'track': track_data
        })
        
        await self.send_message({
            'type': 'log',
            'message': f'已加载地图: {track_data.get("name", map_id)}',
            'level': 'success'
        })

    async def _handle_home(self):
        """处理归位请求"""
        print(f"[Session] 收到 home 命令，开始归位...")

        # 检查是否有代码正在执行
        if self.code_execution_task and not self.code_execution_task.done():
            await self.send_message({
                'type': 'log',
                'message': '请先停止代码执行后再归位',
                'level': 'warning'
            })
            return

        # 暂停广播（防止旧位置覆盖）
        if self.broadcast_task and not self.broadcast_task.done():
            self.broadcast_task.cancel()
            try:
                await self.broadcast_task
            except asyncio.CancelledError:
                pass

        # 停止仿真循环
        if self.simulator_task and not self.simulator_task.done():
            self.simulator_task.cancel()
            try:
                await self.simulator_task
            except asyncio.CancelledError:
                pass

        # 归位处理：重置小车到初始位置和状态
        self.simulator.reset()
        self.simulator.car.stop()
        self.simulator.car.current_speed = 0.0
        self.simulator.car.target_speed = 0.0
        self.simulator.car.motion_duration = 0.0
        self.simulator.car.is_moving = False
        
        # 清除轨道数据
        self.simulator.car.track_waypoints = []
        self.simulator.car.track_width = 0.3

        await self.send_message({
            'type': 'log',
            'message': '小车已归位到初始位置',
            'level': 'success'
        })

        # 发送禁用循线消息（避免残留）
        await self.send_message({
            'type': 'line_disable'
        })
        
        # 发送清除轨道消息给前端
        await self.send_message({
            'type': 'track_clear'
        })

        # 立即广播归位后的状态
        state = self.simulator.get_state()
        await self.send_message({
            'type': 'position',
            'x': state['x'],
            'y': state['y'],
            'rotation': state['rotation']
        })
        await self.send_message({
            'type': 'status',
            'speed': 0.0,
            'is_moving': False
        })

        # 重启仿真循环和广播
        await asyncio.sleep(0.1)  # 短暂延迟确保状态更新
        self.simulator_task = asyncio.create_task(self.simulator.start())
        # 重启广播任务
        if self.broadcast_task and not self.broadcast_task.done():
            self.broadcast_task.cancel()
            try:
                await self.broadcast_task
            except asyncio.CancelledError:
                pass
        self.broadcast_task = asyncio.create_task(self.push_loop())

        # 再次发送位置确认，确保前端正确显示
        await self.send_message({
            'type': 'position',
            'x': state['x'],
            'y': state['y'],
            'rotation': state['rotation']
        })

    async def _handle_control_car(self, message: dict):
        """处理小车控制消息"""
        # 根据具体控制类型进行处理
        control_type = message.get('controlType')
        if control_type == 'forward':
            speed = message.get('speed', 50)
            duration = message.get('duration', 0)
            self.simulator.car.move_forward(speed, duration)
        elif control_type == 'backward':
            speed = message.get('speed', 50)
            duration = message.get('duration', 0)
            self.simulator.car.move_backward(speed, duration)
        elif control_type == 'turn_left':
            angle = message.get('angle', 90)
            self.simulator.car.turn_left(angle)
        elif control_type == 'turn_right':
            angle = message.get('angle', 90)
            self.simulator.car.turn_right(angle)
        elif control_type == 'stop':
            self.simulator.car.stop()
        
        await self.send_message({
            'type': 'log',
            'message': f'小车控制: {control_type}',
            'level': 'info'
        })

    async def _handle_track_load(self, message: dict):
        """处理轨道加载"""
        track_data = message.get('track', {})
        self.simulator.car.load_track_data(track_data)
        
        await self.send_message({
            'type': 'log',
            'message': '轨道数据已加载',
            'level': 'success'
        })
        
        # 发送轨道数据给前端
        await self.send_message({
            'type': 'track_data',
            'track': track_data
        })

    async def _handle_track_clear(self):
        """处理轨道清除"""
        await self.send_message({
            'type': 'track_clear'
        })

    async def _handle_line_disable(self):
        """处理循线禁用"""
        self.simulator.car.disable_line_following()
        await self.send_message({
            'type': 'log',
            'message': '循线功能已禁用',
            'level': 'info'
        })
        await self.send_message({
            'type': 'line_disable'
        })

    async def cleanup(self):
        """清理会话资源"""
        # 取消所有任务
        if self.simulator_task and not self.simulator_task.done():
            self.simulator_task.cancel()
        if self.broadcast_task and not self.broadcast_task.done():
            self.broadcast_task.cancel()
        if self.code_execution_task and not self.code_execution_task.done():
            self.code_execution_task.cancel()
            
        # 停止 simulator
        self.simulator.stop()
        
        # 重置 sandbox 的停止标志
        if getattr(self.sandbox, 'car_api', None):
            self.sandbox.car_api._stopped = False  # 下次运行重置标志
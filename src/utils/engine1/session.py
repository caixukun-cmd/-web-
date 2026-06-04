"""第一引擎会话管理器。"""
import asyncio
import json
import sys
import os
from typing import Callable

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
grandparent_dir = os.path.dirname(parent_dir)
sys.path.insert(0, grandparent_dir)

from src.utils.simulator import get_demo_track, get_available_maps, get_track_by_id
from src.utils.sandbox import CodeSandbox
from src.utils.vision import VisionAPI
from src.utils.engine1.protocol import PROTOCOL_ROUTER


class Engine1Session:
    def __init__(self, websocket, send_message_func: Callable):
        self.websocket = websocket
        self.send_message = send_message_func
        self.simulator = None
        self.sandbox = None
        self.vision = None
        self.code_execution_task = None
        self.simulator_task = None
        self.broadcast_task = None

        from src.utils.simulator import CarSimulator
        self.simulator = CarSimulator()
        self.vision = VisionAPI(simulator=self.simulator)
        self.sandbox = CodeSandbox(
            self.simulator.car,
            self.send_message,
            self.simulator,
            vision=self.vision,
        )

        demo_track = get_demo_track()
        self.simulator.car.load_track_data(demo_track)
        print(f"[Session] 默认轨道已加载到模拟器: {len(self.simulator.car.track_waypoints)} 个路径点")
        self.simulator.car.current_map_id = 'easy'

    async def start(self):
        self.simulator_task = asyncio.create_task(self.simulator.start())
        self.broadcast_task = asyncio.create_task(self.push_loop())

    async def push_loop(self):
        while True:
            try:
                state = self.simulator.get_state()
                env_state = self.simulator.get_env_state()
                await self.send_message({'type': 'position', 'x': state['x'], 'y': state['y'], 'rotation': state['rotation']})
                await self.send_message({'type': 'status', 'speed': state['speed'], 'is_moving': state['is_moving']})
                await self.send_message({'type': 'experiment_state', 'state': env_state})
                await asyncio.sleep(0.1)
            except Exception as e:
                print(f"推送状态时发生错误: {e}")
                break

    async def handle_message(self, message_str: str):
        """处理普通消息，同时兜底识别视觉消息。"""
        try:
            message_data = json.loads(message_str)
            if message_data.get('type') in {'vision_frame', 'vision_detect', 'vision_status', 'vision_projection_result', 'obstacle_truth_result'}:
                await self.handle_vision_message(message_data)
                return
        except Exception:
            pass

        success = await PROTOCOL_ROUTER.route_message(self, message_str)
        if not success:
            print(f"消息处理失败: {message_str[:100]}...")

    async def handle_vision_message(self, data: dict):
        """处理视觉相关消息。"""
        if self.vision is None:
            await self.send_message({'type': 'error', 'message': '视觉模块尚未初始化'})
            return

        message_type = data.get('type')

        if message_type == 'vision_frame':
            frame_base64 = data.get('frame')
            timestamp = data.get('timestamp')
            if not frame_base64:
                await self.send_message({'type': 'error', 'message': 'vision_frame 缺少 frame 字段'})
                return
            try:
                frame_info = await self.vision.update_frame_from_base64(frame_base64, source='websocket_vision_frame')
                await self.send_message({
                    'type': 'vision_frame_ack',
                    'success': True,
                    'timestamp': timestamp,
                    'frameInfo': frame_info,
                })
            except Exception as exc:
                await self.send_message({'type': 'error', 'message': f'视觉帧处理失败: {str(exc)}'})
            return

        if message_type == 'vision_detect':
            try:
                detect_result = await self.vision.detect()
                await self.send_message({'type': 'vision_detect_result', 'success': True, 'result': detect_result})
            except Exception as exc:
                await self.send_message({'type': 'error', 'message': f'视觉检测失败: {str(exc)}'})
            return

        if message_type == 'vision_status':
            try:
                status = await self.vision.get_status()
                await self.send_message({'type': 'vision_status_result', 'success': True, 'status': status})
            except Exception as exc:
                await self.send_message({'type': 'error', 'message': f'获取视觉状态失败: {str(exc)}'})
            return

        if message_type == 'vision_projection_result':
            try:
                projection_result = self.vision.update_projection_result(data)
                await self.send_message({'type': 'vision_projection_ack', 'success': True, 'result': projection_result})
            except Exception as exc:
                await self.send_message({'type': 'error', 'message': f'处理仿真投影结果失败: {str(exc)}'})
            return

        if message_type == 'obstacle_truth_result':
            try:
                truth_result = self.vision.update_obstacle_truth(data)
                await self.send_message({'type': 'obstacle_truth_ack', 'success': True, 'count': truth_result.get('count', 0)})
            except Exception as exc:
                await self.send_message({'type': 'error', 'message': f'处理障碍物真值结果失败: {str(exc)}'})
            return

        await self.send_message({'type': 'error', 'message': f'未知视觉消息类型: {message_type}'})

    async def _handle_run_code(self, message: dict):
        self.simulator.start_code_execution()
        code = message.get('code', '')
        if code:
            await self.send_message({'type': 'log', 'message': '开始执行代码...', 'level': 'info'})
            if self.code_execution_task and not self.code_execution_task.done():
                self.code_execution_task.cancel()
                try:
                    await self.code_execution_task
                except asyncio.CancelledError:
                    pass
            self.code_execution_task = asyncio.create_task(self.sandbox.execute(code))
        self.simulator.end_code_execution()

    async def _handle_stop(self):
        print("[Session] 收到 stop 命令，开始强制处理...")
        if self.code_execution_task and not self.code_execution_task.done():
            self.code_execution_task.cancel()
            try:
                await self.code_execution_task
            except asyncio.CancelledError:
                print("[Session] 用户代码 task 已取消 (stop)")

        if self.broadcast_task and not self.broadcast_task.done():
            self.broadcast_task.cancel()
            try:
                await self.broadcast_task
            except asyncio.CancelledError:
                pass

        if self.simulator_task and not self.simulator_task.done():
            self.simulator_task.cancel()
            try:
                await self.simulator_task
            except asyncio.CancelledError:
                pass

        if self.sandbox.car_api:
            self.sandbox.car_api._stopped = True
        if self.vision is not None:
            self.vision.clear_evaluation()
        self.simulator.car.stop()
        self.simulator.car.current_speed = 0.0
        self.simulator.car.target_speed = 0.0
        self.simulator.car.motion_duration = 0.0
        self.simulator.car.is_moving = False

        await self.send_message({'type': 'log', 'message': '已强制停止代码执行和小车运动', 'level': 'success'})
        await self.send_message({'type': 'line_disable'})

        state = self.simulator.get_state()
        await self.send_message({'type': 'position', 'x': state['x'], 'y': state['y'], 'rotation': state['rotation']})
        await self.send_message({'type': 'status', 'speed': 0.0, 'is_moving': False})

        await asyncio.sleep(0.8)
        self.simulator_task = asyncio.create_task(self.simulator.start())
        if self.broadcast_task and not self.broadcast_task.done():
            self.broadcast_task.cancel()
            try:
                await self.broadcast_task
            except asyncio.CancelledError:
                pass
        self.broadcast_task = asyncio.create_task(self.push_loop())

    async def _handle_get_maps(self):
        maps = get_available_maps()
        await self.send_message({'type': 'maps_list', 'maps': maps})
        print(f"[Session] 返回地图列表: {len(maps)} 个地图")

    async def _handle_select_map(self, message: dict):
        map_id = message.get('mapId', 'easy')
        print(f"[Session] 收到地图选择: {map_id}")
        self.simulator.car.current_map_id = map_id
        track_data = get_track_by_id(map_id)
        self.simulator.car.load_track_data(track_data)
        await self.send_message({'type': 'track_data', 'track': track_data})
        await self.send_message({'type': 'log', 'message': f'已加载地图: {track_data.get("name", map_id)}', 'level': 'success'})

    async def _handle_home(self):
        print("[Session] 收到 home 命令，开始归位...")
        if self.code_execution_task and not self.code_execution_task.done():
            await self.send_message({'type': 'log', 'message': '请先停止代码执行后再归位', 'level': 'warning'})
            return

        if self.broadcast_task and not self.broadcast_task.done():
            self.broadcast_task.cancel()
            try:
                await self.broadcast_task
            except asyncio.CancelledError:
                pass

        if self.simulator_task and not self.simulator_task.done():
            self.simulator_task.cancel()
            try:
                await self.simulator_task
            except asyncio.CancelledError:
                pass

        self.simulator.reset()
        if self.vision is not None:
            self.vision.clear_evaluation()
        self.simulator.car.stop()
        self.simulator.car.current_speed = 0.0
        self.simulator.car.target_speed = 0.0
        self.simulator.car.motion_duration = 0.0
        self.simulator.car.is_moving = False
        self.simulator.car.track_waypoints = []
        self.simulator.car.track_width = 0.3

        await self.send_message({'type': 'log', 'message': '小车已归位到初始位置', 'level': 'success'})
        await self.send_message({'type': 'line_disable'})
        await self.send_message({'type': 'track_clear'})

        state = self.simulator.get_state()
        await self.send_message({'type': 'position', 'x': state['x'], 'y': state['y'], 'rotation': state['rotation']})
        await self.send_message({'type': 'status', 'speed': 0.0, 'is_moving': False})

        await asyncio.sleep(0.1)
        self.simulator_task = asyncio.create_task(self.simulator.start())
        if self.broadcast_task and not self.broadcast_task.done():
            self.broadcast_task.cancel()
            try:
                await self.broadcast_task
            except asyncio.CancelledError:
                pass
        self.broadcast_task = asyncio.create_task(self.push_loop())
        await self.send_message({'type': 'position', 'x': state['x'], 'y': state['y'], 'rotation': state['rotation']})

    async def _handle_control_car(self, message: dict):
        control_type = message.get('controlType')
        if control_type == 'forward':
            self.simulator.car.move_forward(message.get('speed', 50), message.get('duration', 0))
        elif control_type == 'backward':
            self.simulator.car.move_backward(message.get('speed', 50), message.get('duration', 0))
        elif control_type == 'turn_left':
            self.simulator.car.turn_left(message.get('angle', 90))
        elif control_type == 'turn_right':
            self.simulator.car.turn_right(message.get('angle', 90))
        elif control_type == 'stop':
            self.simulator.car.stop()
        await self.send_message({'type': 'log', 'message': f'小车控制: {control_type}', 'level': 'info'})

    async def _handle_track_load(self, message: dict):
        track_data = message.get('track', {})
        self.simulator.car.load_track_data(track_data)
        await self.send_message({'type': 'log', 'message': '轨道数据已加载', 'level': 'success'})
        await self.send_message({'type': 'track_data', 'track': track_data})

    async def _handle_track_clear(self):
        await self.send_message({'type': 'track_clear'})

    async def _handle_line_disable(self):
        self.simulator.car.disable_line_following()
        await self.send_message({'type': 'log', 'message': '循线功能已禁用', 'level': 'info'})
        await self.send_message({'type': 'line_disable'})

    async def _handle_set_experiment_config(self, message: dict):
        config = message.get('config', {})
        try:
            applied_config = self.simulator.car.apply_experiment_config(config)
            await self.send_message({
                'type': 'experiment_config_applied',
                'success': True,
                'config': applied_config,
            })
            await self.send_message({
                'type': 'log',
                'message': f"实验默认配置已生效: speed={applied_config['initial_speed']}, PID=({applied_config['pid_kp']}, {applied_config['pid_ki']}, {applied_config['pid_kd']}), sensors={applied_config['sensor_count']}",
                'level': 'success',
            })
        except Exception as exc:
            await self.send_message({
                'type': 'experiment_config_applied',
                'success': False,
                'message': str(exc),
            })
            await self.send_message({'type': 'error', 'message': f'实验配置应用失败: {str(exc)}'})

    async def cleanup(self):
        if self.simulator_task and not self.simulator_task.done():
            self.simulator_task.cancel()
        if self.broadcast_task and not self.broadcast_task.done():
            self.broadcast_task.cancel()
        if self.code_execution_task and not self.code_execution_task.done():
            self.code_execution_task.cancel()
        self.simulator.stop()
        if self.vision is not None:
            await self.vision.close()
        if getattr(self.sandbox, 'car_api', None):
            self.sandbox.car_api._stopped = False

"""
虚拟小车仿真引擎
支持差速驱动、位置跟踪、角度控制
"""
import asyncio
import math
import time
from typing import Dict, Any


class VirtualCar:
    """虚拟小车类"""

    def __init__(self):
        # 位置和姿态
        self.x: float = 0.0
        self.y: float = 0.0
        self.rotation: float = 0.0  # 角度（度）

        # 运动状态
        self.current_speed: float = 0.0          # 当前实际生效的速度（包含正负）
        self.target_speed: float = 0.0           # 用户期望的速度（正向前，负向后）
        self.is_moving: bool = False

        # 定时运动控制（带duration的情况）
        self.motion_start_time: float = 0.0
        self.motion_duration: float = 0.0       # 0表示无定时（持续运动）

        self.last_update: float = time.time()
        self.max_speed: float = 100.0

        # 传感器数据（暂时保留）
        self.sensors: Dict[str, Any] = {
            'infrared': [0, 0, 0, 0, 0],
            'ultrasonic': 100.0,
        }

    def move_forward(self, speed: float, duration: float = 0.0):
        """前进，duration=0表示持续运动直到stop"""
        speed = max(0, min(speed, self.max_speed))
        self.target_speed = speed
        self._start_motion(duration)
        print(f"前进命令: 速度={speed:.1f}, 时长={duration:.1f}s")

    def move_backward(self, speed: float, duration: float = 0.0):
        """后退，duration=0表示持续运动直到stop"""
        speed = max(0, min(speed, self.max_speed))
        self.target_speed = -speed
        self._start_motion(duration)
        print(f"后退命令: 速度={speed:.1f}, 时长={duration:.1f}s")

    def _start_motion(self, duration: float):
        """统一处理运动开始"""
        self.motion_start_time = time.time()
        self.motion_duration = duration  # 0 = 无限持续
        self.current_speed = self.target_speed
        self.is_moving = abs(self.current_speed) > 0.01

    def turn_left(self, angle: float):
        """左转（瞬时）"""
        self.rotation = (self.rotation + angle) % 360
        print(f"左转 {angle}° → 当前朝向: {self.rotation:.1f}°")

    def turn_right(self, angle: float):
        """右转（瞬时）"""
        self.rotation = (self.rotation - angle) % 360
        print(f"右转 {angle}° → 当前朝向: {self.rotation:.1f}°")

    def stop(self):
        """立即停止所有运动"""
        self.current_speed = 0.0
        self.target_speed = 0.0
        self.motion_duration = 0.0
        self.is_moving = False
        print("小车停止")

    def update_position(self, delta_time: float):
        """每帧更新位置"""
        current_time = time.time()

        # 判断当前是否应该保持运动
        if self.motion_duration > 0:
            # 有定时 → 检查是否超时
            if (current_time - self.motion_start_time) >= self.motion_duration:
                self.current_speed = 0.0
                self.is_moving = False
                self.motion_duration = 0.0  # 定时结束
        # 否则（motion_duration == 0） → 持续运动，直到被stop

        # 只有有速度时才产生位移
        if abs(self.current_speed) > 0.01:
            rad = math.radians(self.rotation)
            # 速度单位换算：speed=100 → 约0.5米/秒（可自行调整系数）
            distance = self.current_speed / 100.0 * delta_time * 5.0

            self.x += distance * math.sin(rad)
            self.y += distance * math.cos(rad)

            # 简单范围限制（可根据实际场景调整）
            self.x = max(-15, min(15, self.x))
            self.y = max(-15, min(15, self.y))

    def get_position(self) -> Dict[str, float]:
        return {
            'x': round(self.x, 2),
            'y': round(self.y, 2),
            'rotation': round(self.rotation, 2)
        }

    def get_speed(self) -> float:
        return round(self.current_speed, 2)

    def reset(self):
        """重置所有状态"""
        self.x = 0.0
        self.y = 0.0
        self.rotation = 0.0
        self.current_speed = 0.0
        self.target_speed = 0.0
        self.motion_duration = 0.0
        self.is_moving = False
        self.motion_start_time = time.time()

    def to_dict(self) -> Dict[str, Any]:
        return {
            'x': round(self.x, 2),
            'y': round(self.y, 2),
            'rotation': round(self.rotation, 2),
            'speed': round(self.current_speed, 2),
            'is_moving': self.is_moving,
            'sensors': self.sensors
        }


class CarSimulator:
    """小车仿真器（基本保持不变）"""

    def __init__(self):
        self.car = VirtualCar()
        self.is_running = False
        self.update_interval = 0.05  # 50ms

    async def start(self):
        self.is_running = True
        last_time = time.time()

        while self.is_running:
            current_time = time.time()
            delta_time = min(current_time - last_time, 0.1)
            last_time = current_time

            self.car.update_position(delta_time)

            await asyncio.sleep(self.update_interval)

    def stop(self):
        self.is_running = False
        self.car.stop()

    def reset(self):
        self.car.reset()

    def get_state(self) -> Dict[str, Any]:
        return self.car.to_dict()

    def start_code_execution(self):
        pass  # 如有需要可保留

    def end_code_execution(self):
        pass
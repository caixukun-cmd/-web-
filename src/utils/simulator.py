"""
虚拟小车仿真引擎
支持差速驱动、位置跟踪、角度控制、循线功能（状态机架构）
"""
import asyncio
import math
import time
from enum import Enum
from typing import Dict, Any, List, Optional


class LineFollowState(Enum):
    """循线状态机状态"""
    FOLLOW = 1   # 正常循线：PID 处理小偏差
    LOST = 2     # 刚丢线：冻结转向，减速等待
    SEARCH = 3   # 搜线中：固定角速度转向


# ===== 轨道数据处理 =====
def generate_waypoints_from_segments(segments: List[dict], sample_interval: float = 0.2) -> List[dict]:
    """从 segments 生成路径点（与前端 trackLoader.js 保持一致）"""
    waypoints = []
    
    for segment in segments:
        if segment.get('type') == 'line':
            start = {'x': segment['start'][0], 'z': segment['start'][1]}
            end = {'x': segment['end'][0], 'z': segment['end'][1]}
            length = math.sqrt((end['x'] - start['x'])**2 + (end['z'] - start['z'])**2)
            num_samples = max(2, math.ceil(length / sample_interval))
            
            for i in range(num_samples):
                t = i / (num_samples - 1) if num_samples > 1 else 0
                waypoints.append({
                    'x': start['x'] + (end['x'] - start['x']) * t,
                    'z': start['z'] + (end['z'] - start['z']) * t
                })
        elif segment.get('type') == 'arc':
            center = {'x': segment['center'][0], 'z': segment['center'][1]}
            radius = segment['radius']
            start_angle = math.radians(segment['startAngle'])
            end_angle = math.radians(segment['endAngle'])
            
            # 计算弧长（支持顺时针） - 与前端一致
            angle_diff = end_angle - start_angle
            clockwise = segment.get('clockwise', False)
            
            if clockwise:
                # 顺时针：让 angle_diff 为负
                if angle_diff > 0:
                    angle_diff -= 2 * math.pi
            else:
                # 逆时针（默认）：让 angle_diff 为正
                if angle_diff < 0:
                    angle_diff += 2 * math.pi
            
            arc_length = radius * abs(angle_diff)
            num_samples = max(2, math.ceil(arc_length / sample_interval))
            
            for i in range(num_samples):
                t = i / (num_samples - 1) if num_samples > 1 else 0
                angle = start_angle + angle_diff * t
                waypoints.append({
                    'x': center['x'] + radius * math.cos(angle),
                    'z': center['z'] + radius * math.sin(angle)
                })
    
    # 去重（相邻点距离过近的） - 与前端一致
    return deduplicate_waypoints(waypoints, sample_interval * 0.5)


def deduplicate_waypoints(waypoints: List[dict], min_distance: float) -> List[dict]:
    """去重路径点（与前端 trackLoader.js 保持一致）"""
    if len(waypoints) < 2:
        return waypoints
    
    result = [waypoints[0]]
    for i in range(1, len(waypoints)):
        last = result[-1]
        curr = waypoints[i]
        dist = math.sqrt((curr['x'] - last['x'])**2 + (curr['z'] - last['z'])**2)
        if dist >= min_distance:
            result.append(curr)
    
    return result


def get_demo_track() -> dict:
    """获取演示轨道数据"""
    return {
        'name': '示例循线轨道',
        'trackWidth': 0.3,
        'segments': [
            {'type': 'line', 'start': [0, 0], 'end': [0, 10]},

            # 左上角
            {'type': 'arc', 'center': [3, 10], 'radius': 3, 'startAngle': 180, 'endAngle': 90, 'clockwise': True},

            #    上边
            {'type': 'line', 'start': [3, 13], 'end': [10, 13]},

            # 右上角（+z → +x）
            {'type': 'arc', 'center': [10, 10], 'radius': 3, 'startAngle': 90, 'endAngle': 0, 'clockwise': True},

            # 右边
            {'type': 'line', 'start': [13, 10], 'end': [13, 3]},

            # 右下角（+x → -z）
            {'type': 'arc', 'center': [10, 3], 'radius': 3, 'startAngle': 0, 'endAngle': -90, 'clockwise': True},

            # 下边
            {'type': 'line', 'start': [10, 0], 'end': [3, 0]},

            # 左下角（-z → -x）
            {'type': 'arc', 'center': [3, 3], 'radius': 3, 'startAngle': -90, 'endAngle': -180, 'clockwise': True}
        ]
    }


def compute_track_checksum(track_data: dict) -> dict:
    """计算轨道数据校验信息"""
    import hashlib
    import json
    
    segments = track_data.get('segments', [])
    
    # 计算校验信息
    checksum = {
        'segmentCount': len(segments),
        'trackWidth': track_data.get('trackWidth', 0),
        'firstSegment': segments[0] if segments else None,
        'lastSegment': segments[-1] if segments else None,
    }
    
    # 计算 JSON 哈希
    track_json = json.dumps(track_data, sort_keys=True)
    checksum['hash'] = hashlib.md5(track_json.encode()).hexdigest()[:8]
    
    return checksum


def get_demo_track_with_checksum() -> dict:
    """获取演示轨道数据（带校验信息）"""
    track = get_demo_track()
    checksum = compute_track_checksum(track)
    return {
        **track,
        '_checksum': checksum
    }


class VirtualCar:
    """虚拟小车类"""


    def __init__(self, world_limit=1000):
        self.world_limit = world_limit
        # 位置和姿态
        self.x: float = 0.0
        self.y: float = 0.0
        self.rotation: float = 0.0  # 角度（度）
        self.was_line_lost = False
        self.search_dir = 1  # +1 右搜，-1 左搜
        self.search_lost_time = 0.0  # 连续丢线累计时间

        # 运动状态
        self.current_speed: float = 0.0          # 当前实际生效的速度（包含正负）
        self.target_speed: float = 0.0           # 用户期望的速度（正向前，负向后）
        self.is_moving: bool = False

        # 定时运动控制（带duration的情况）
        self.motion_start_time: float = 0.0
        self.motion_duration: float = 0.0       # 0表示无定时（持续运动）

        # 转向控制
        self.current_turn_speed: float = 0.0    # 当前转向速度（度/秒）
        self.turn_start_time: float = 0.0
        self.turn_duration: float = 0.0
        self.target_rotation: float = 0.0       # 目标旋转角度
        self.max_turn_speed: float = 180.0      # 默认转向速度：180度/秒

        self.last_update: float = time.time()
        self.max_speed: float = 200.0

        # 传感器数据（暂时保留）
        self.sensors: Dict[str, Any] = {
            'infrared': [0, 0, 0, 0, 0],
            'ultrasonic': 100.0,
        }
        
        # ===== 循线系统状态 =====
        self.line_following_enabled: bool = False
        self.track_waypoints: List[dict] = []  # [{x, z}, ...]
        self.track_width: float = 0.3
        
        # 状态机
        self.lf_state: LineFollowState = LineFollowState.FOLLOW
        self.lost_start_time: float = 0.0
        self.search_dir: int = 1  # +1 右搜，-1 左搜
        
        # 状态机参数
        self.lost_freeze_time: float = 0.2   # LOST 状态冻结时间（秒）
        self.search_turn_speed: float = 60.0  # SEARCH 状态固定角速度（度/秒）
        self.search_move_speed: float = 5.0   # SEARCH 状态移动速度
        self.lost_move_speed_ratio: float = 0.3  # LOST 状态速度比例
        
        # PID 参数（仅 FOLLOW 状态使用）
        self.pid_kp: float = 2.0
        self.pid_ki: float = 0.0
        self.pid_kd: float = 0.3
        self.steering_scale: float = 60.0  # 转向缩放（度/秒）
        
        # PID 状态
        self.pid_integral: float = 0.0
        self.pid_last_error: float = 0.0
        self.pid_max_integral: float = 5.0
        
        # 低通滤波状态
        self.filtered_error: float = 0.0
        self.filter_alpha: float = 0.3  # 滤波系数 (0-1, 越小越平滑)
        
        # 探头配置
        self.sensor_count: int = 5
        self.sensor_spacing: float = 0.15
        self.sensor_forward_offset: float = 0.6

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

    def turn_right(self, angle: float):
        """右转（平滑）"""
        angle = abs(angle)
        self.target_rotation = (self.rotation + angle) % 360
        duration = angle / self.max_turn_speed
        self.current_turn_speed = self.max_turn_speed
        self.turn_start_time = time.time()
        self.turn_duration = duration
        print(f"右转命令: 角度={angle}°, 目标角度={self.target_rotation:.2f}°, 预估耗时={duration:.2f}s")

    def turn_left(self, angle: float):
        """左转（平滑）"""
        angle = abs(angle)
        self.target_rotation = (self.rotation - angle) % 360
        duration = angle / self.max_turn_speed
        self.current_turn_speed = -self.max_turn_speed
        self.turn_start_time = time.time()
        self.turn_duration = duration
        print(f"左转命令: 角度={angle}°, 目标角度={self.target_rotation:.2f}°, 预估耗时={duration:.2f}s")

    def stop(self):
        """立即停止所有运动"""
        self.current_speed = 0.0
        self.target_speed = 0.0
        self.motion_duration = 0.0
        self.current_turn_speed = 0.0
        self.turn_duration = 0.0
        self.is_moving = False
        print("小车停止")

    def update_position(self, delta_time: float):
        """每帧更新位置和角度"""
        current_time = time.time()

        # 1. 处理平滑转向（手动转向命令）
        if self.turn_duration > 0:
            elapsed = current_time - self.turn_start_time
            if elapsed >= self.turn_duration:
                # 转向完成，精确设置到目标角度
                self.rotation = self.target_rotation
                self.current_turn_speed = 0.0
                self.turn_duration = 0.0
            else:
                # 逐帧更新角度
                self.rotation = (self.rotation + self.current_turn_speed * delta_time) % 360

        # 2. 处理直线运动定时
        if self.motion_duration > 0:
            # 有定时 → 检查是否超时
            if (current_time - self.motion_start_time) >= self.motion_duration:
                self.current_speed = 0.0
                self.is_moving = False
                self.motion_duration = 0.0  # 定时结束
        # 否则（motion_duration == 0） → 持续运动，直到被stop
        
        # 3. 循线系统转向控制
        if self.line_following_enabled:
            self._update_line_following(delta_time)

        # 4. 只有有速度时才产生位移
        if abs(self.current_speed) > 0.01:
            rad = math.radians(self.rotation)
            # 速度单位换算：speed=100 → 约0.5米/秒（可自行调整系数）
            distance = self.current_speed / 100.0 * delta_time * 5.0

            self.x += distance * math.sin(rad)
            self.y += distance * math.cos(rad)

            # 简单范围限制（可根据实际场景调整）
            self.x = max(-self.world_limit, min(self.world_limit, self.x))
            self.y = max(-self.world_limit, min(self.world_limit, self.y))
    
    # ===== 循线系统方法 =====
    
    def load_demo_track(self):
        """加载演示轨道"""
        demo_track = get_demo_track()
        self.load_track_data(demo_track)
        print(f"[OK] 演示轨道已加载: {len(self.track_waypoints)} 个路径点")
    
    def load_track_data(self, track_data: dict):
        """加载轨道数据"""
        self.track_width = track_data.get('trackWidth', 0.3)
        
        if 'waypoints' in track_data and track_data['waypoints']:
            self.track_waypoints = [{'x': p[0], 'z': p[1]} for p in track_data['waypoints']]
        elif 'segments' in track_data and track_data['segments']:
            self.track_waypoints = generate_waypoints_from_segments(track_data['segments'])
        else:
            self.track_waypoints = []
        
        print(f"[OK] 轨道已加载: {len(self.track_waypoints)} 个路径点, 宽度 {self.track_width}")
    
    def enable_line_following(self, kp: float = 1.0, ki: float = 0.0, kd: float = 0.1, steering_scale: float = 45.0):
        """启用循线功能"""
        if not self.track_waypoints:
            print("警告: 轨道未加载，无法启用循线")
            return False
        
        self.pid_kp = kp
        self.pid_ki = ki
        self.pid_kd = kd
        self.steering_scale = steering_scale
        self.pid_integral = 0.0
        self.pid_last_error = 0.0
        self.filtered_error = 0.0
        # 初始化状态机
        self.lf_state = LineFollowState.FOLLOW
        self.lost_start_time = 0.0
        self.line_following_enabled = True
        print(f"[OK] 循线已启用(状态机模式): Kp={kp}, Ki={ki}, Kd={kd}, Scale={steering_scale}")
        return True
    
    def disable_line_following(self):
        """禁用循线功能"""
        self.line_following_enabled = False
        self.lf_state = LineFollowState.FOLLOW
        self.pid_integral = 0.0
        self.pid_last_error = 0.0
        print("[OK] 循线已禁用")
    
    def _update_line_following(self, delta_time: float):
        """更新循线控制（状态机架构）"""
        if not self.track_waypoints:
            return
        
        current_time = time.time()
        
        # 1. 检测探头读数
        sensor_readings = self._detect_sensors()
        
        # 2. 计算循线误差
        raw_error, line_lost = self._calculate_line_error(sensor_readings)
        
        # 3. 更新搜索方向（仅在检测到线时更新）
        if not line_lost:
            if raw_error > 0.1:
                self.search_dir = 1   # 线在右边，搜索时应该右转
            elif raw_error < -0.1:
                self.search_dir = -1  # 线在左边，搜索时应该左转
        
        # ===== 状态转移 =====
        prev_state = self.lf_state
        
        if self.lf_state == LineFollowState.FOLLOW:
            if line_lost:
                # FOLLOW -> LOST
                self.lf_state = LineFollowState.LOST
                self.lost_start_time = current_time
                
        elif self.lf_state == LineFollowState.LOST:
            if not line_lost:
                # LOST -> FOLLOW
                self.lf_state = LineFollowState.FOLLOW
            elif current_time - self.lost_start_time > self.lost_freeze_time:
                # LOST -> SEARCH
                self.lf_state = LineFollowState.SEARCH
                
        elif self.lf_state == LineFollowState.SEARCH:
            if not line_lost:
                # SEARCH -> FOLLOW
                self.lf_state = LineFollowState.FOLLOW
                self.pid_integral = 0.0  # 重置积分项
        
        # ===== 状态行为 =====
        steering = 0.0
        
        if self.lf_state == LineFollowState.FOLLOW:
            # 正常循线：PID 处理小偏差
            # 低通滤波平滑误差信号
            self.filtered_error = self._low_pass_filter(raw_error)
            
            # 死区处理：很小的误差不响应
            if abs(self.filtered_error) < 0.05:
                self.filtered_error = 0.0
            
            # PID 计算
            steering = self._compute_pid(self.filtered_error, delta_time)
            self.current_speed = self.target_speed
            
        elif self.lf_state == LineFollowState.LOST:
            # 刚丢线：冻结转向，减速等待
            steering = 0.0  # 不转向！
            self.current_speed = max(self.target_speed * self.lost_move_speed_ratio, 2.0)
            
        elif self.lf_state == LineFollowState.SEARCH:
            # 搜线中：固定角速度转向，不用 PID！
            steering = self.search_dir * self.search_turn_speed
            self.current_speed = max(self.search_move_speed, 2.0)
        
        # 4. 应用转向
        self.rotation = (self.rotation + steering * delta_time) % 360
        if self.rotation < 0:
            self.rotation += 360
        
        # 调试信息
        state_name = self.lf_state.name
        print(f"[DBG] state={state_name} sensors={sensor_readings} err={round(raw_error, 3)} steer={round(steering, 1)} dir={self.search_dir}")
    
    def _low_pass_filter(self, raw_value: float) -> float:
        """低通滤波：平滑阶梯信号"""
        self.filtered_error = self.filter_alpha * raw_value + (1 - self.filter_alpha) * self.filtered_error
        return self.filtered_error
    
    def _detect_sensors(self) -> List[int]:
        """检测探头读数"""
        readings = []
        count = self.sensor_count
        spacing = self.sensor_spacing
        forward_offset = self.sensor_forward_offset
        
        # 计算探头位置
        total_width = (count - 1) * spacing
        start_x = -total_width / 2
        
        car_rad = math.radians(self.rotation)
        cos_r = math.cos(car_rad)
        sin_r = math.sin(car_rad)
        
        for i in range(count):
            local_x = start_x + i * spacing
            local_z = forward_offset
            
            # 转换到世界坐标
            world_x = self.x + local_x * cos_r + local_z * sin_r
            world_z = self.y - local_x * sin_r + local_z * cos_r
            
            # 检测是否在轨道上
            hit = self._sample_track_at_point(world_x, world_z)
            readings.append(hit)
        
        return readings
    
    def _sample_track_at_point(self, x: float, z: float) -> int:
        """检测点是否在轨道上"""
        if not self.track_waypoints:
            return 0
        
        half_width = self.track_width / 2
        
        # 查找最近的路径段
        min_dist = float('inf')
        
        for i in range(len(self.track_waypoints) - 1):
            p1 = self.track_waypoints[i]
            p2 = self.track_waypoints[i + 1]
            
            # 计算点到线段的距离
            dist = self._point_to_segment_distance(x, z, p1['x'], p1['z'], p2['x'], p2['z'])
            if dist < min_dist:
                min_dist = dist
        
        return 1 if min_dist <= half_width else 0
    
    def _point_to_segment_distance(self, px: float, pz: float, x1: float, z1: float, x2: float, z2: float) -> float:
        """计算点到线段的距离"""
        dx = x2 - x1
        dz = z2 - z1
        length_sq = dx * dx + dz * dz
        
        if length_sq == 0:
            return math.sqrt((px - x1)**2 + (pz - z1)**2)
        
        t = max(0, min(1, ((px - x1) * dx + (pz - z1) * dz) / length_sq))
        proj_x = x1 + t * dx
        proj_z = z1 + t * dz
        
        return math.sqrt((px - proj_x)**2 + (pz - proj_z)**2)
    
    def _calculate_line_error(self, readings: List[int]) -> tuple:
        """计算循线误差"""
        count = len(readings)
        if count == 0:
            return 0, True
        
        hit_indices = [i for i, r in enumerate(readings) if r == 1]
        
        if not hit_indices:
            return 0, True  # 丢线
        
        # 计算加权平均位置
        center_index = (count - 1) / 2
        weighted_sum = sum((idx - center_index) / center_index if center_index > 0 else 0 for idx in hit_indices)
        error = weighted_sum / len(hit_indices)
        
        return error, False
    
    def _compute_pid(self, error: float, delta_time: float) -> float:
        """PID 计算（仅在 FOLLOW 状态使用）"""
        # P
        p_term = self.pid_kp * error

        # I
        self.pid_integral += error * delta_time
        self.pid_integral = max(
            -self.pid_max_integral,
            min(self.pid_max_integral, self.pid_integral)
        )
        i_term = self.pid_ki * self.pid_integral

        # D
        if delta_time > 0:
            derivative = (error - self.pid_last_error) / delta_time
            # 限制微分项最大值，防止阶梯跳变引起的尖峰
            derivative = max(-5.0, min(5.0, derivative))
            d_term = self.pid_kd * derivative
        else:
            d_term = 0.0

        # 记录误差
        self.pid_last_error = error

        output = p_term + i_term + d_term
        return output * self.steering_scale

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
        self.current_turn_speed = 0.0
        self.turn_duration = 0.0
        self.target_rotation = 0.0
        self.is_moving = False
        self.motion_start_time = time.time()
        # 重置循线状态
        self.line_following_enabled = False
        self.lf_state = LineFollowState.FOLLOW
        self.lost_start_time = 0.0
        self.search_dir = 1
        self.pid_integral = 0.0
        self.pid_last_error = 0.0
        self.filtered_error = 0.0

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
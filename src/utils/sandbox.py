"""
安全代码执行沙箱
通过AST静态分析和API白名单机制确保代码执行安全
"""
import ast
import asyncio
import time
from typing import Dict, Any, Callable, Optional
from io import StringIO
import sys


class CodeValidator:
    """代码验证器 - 使用AST静态分析"""

    # 允许的内置函数白名单
    ALLOWED_BUILTINS = {
        'print', 'len', 'range', 'str', 'int', 'float', 'bool',
        'abs', 'min', 'max', 'round', 'sum'
    }

    # 禁止的节点类型
    FORBIDDEN_NODES = {
        ast.Import: "禁止使用import语句",
        ast.ImportFrom: "禁止使用from...import语句",
    }

    # 禁止的函数调用
    FORBIDDEN_CALLS = {
        'exec', 'eval', 'compile', '__import__',
        'open', 'input', 'file'
    }

    @classmethod
    def validate(cls, code: str) -> tuple[bool, Optional[str]]:
        """
        验证代码安全性
        返回: (是否安全, 错误信息)
        """
        try:
            tree = ast.parse(code)
        except SyntaxError as e:
            return False, f"语法错误: {str(e)}"

        # 检查禁止的节点
        for node in ast.walk(tree):
            for forbidden_type, message in cls.FORBIDDEN_NODES.items():
                if isinstance(node, forbidden_type):
                    return False, message

            # 检查函数调用
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name):
                    if node.func.id in cls.FORBIDDEN_CALLS:
                        return False, f"禁止调用函数: {node.func.id}"

        return True, None


class SafeCarAPI:
    """安全的小车API - 提供给用户代码使用"""

    def __init__(self, car, log_callback: Callable, send_callback: Callable = None):
        self.car = car
        self.log = log_callback
        self.send_callback = send_callback  # 新增：WebSocket 发送回调
        self._stopped = False  # 新增：停止标志

    def _check_stopped(self):
        if self._stopped:
            self.log("警告：执行已被停止，忽略后续运动命令")
            return True
        return False

    def forward(self, speed: float, duration: float = 2.0):
        if self._check_stopped():
            return
        self.car.move_forward(speed, duration)
        self.log(f"小车前进，速度: {speed}, 持续时间: {duration}秒")

    def backward(self, speed: float, duration: float = 2.0):
        if self._check_stopped():
            return
        self.car.move_backward(speed, duration)
        self.log(f"小车后退，速度: {speed}, 持续时间: {duration}秒")

    def turn_left(self, angle: float):
        if self._check_stopped():
            return
        self.car.turn_left(angle)
        self.log(f"小车左转: {angle}°")

    def turn_right(self, angle: float):
        if self._check_stopped():
            return
        self.car.turn_right(angle)
        self.log(f"小车右转: {angle}°")

    def stop(self):
        self.car.stop()
        self._stopped = True  # 设置停止标志
        self.log("小车停止")

    def get_position(self) -> Dict[str, float]:
        return self.car.get_position()

    async def wait(self):  # 修改为 async
        if self._stopped:
            return
        # 同时检查直线运动和转向运动
        while ((abs(self.car.current_speed) > 0.01 and
               (self.car.motion_duration == 0 or
                (time.time() - self.car.motion_start_time) < self.car.motion_duration)) or
               (abs(self.car.current_turn_speed) > 0.01 and
                (time.time() - self.car.turn_start_time) < self.car.turn_duration)):
            
            if self._stopped:
                break
            await asyncio.sleep(0.05)  # 实际异步等待

    # ===== 循线系统 API（后端实现） =====

    async def load_demo_track(self):
        """加载演示轨道"""
        if self._check_stopped():
            return
        self.car.load_demo_track()
        self.log("已加载轨道")
        
        # 通知前端更新可视化，发送实际的轨道数据
        if self.send_callback:
            # 构建轨道数据发送给前端
            track_data = {
                'name': self.car.current_map_id or 'demo',
                'trackWidth': self.car.track_width,
                'waypoints': [[p['x'], p['z']] for p in self.car.track_waypoints]
            }
            await self.send_callback({
                'type': 'track_data',
                'track': track_data
            })

    async def load_track_url(self, url: str):
        """从 URL 加载轨道（暂不支持，使用 load_demo_track 代替）"""
        if self._check_stopped():
            return
        self.log(f"暂不支持从 URL 加载轨道，请使用 load_demo_track()")

    async def load_track_data(self, track_data: dict):
        """加载轨道数据"""
        if self._check_stopped():
            return
        self.car.load_track_data(track_data)
        self.log("已加载轨道数据")

    async def init_line_following(self):
        """初始化循线系统（后端不需要特别初始化）"""
        if self._check_stopped():
            return
        self.log("循线系统已就绪")

    async def enable_line_following(self, kp: float = 1.0, ki: float = 0.0, kd: float = 0.1, steering_scale: float = 45.0):
        """
        启用循线功能
        
        Args:
            kp: 比例系数
            ki: 积分系数
            kd: 微分系数
            steering_scale: 转向缩放系数（度/秒）
        """
        if self._check_stopped():
            return
        success = self.car.enable_line_following(kp, ki, kd, steering_scale)
        if success:
            self.log(f"已启用循线功能 (Kp={kp}, Ki={ki}, Kd={kd}, Scale={steering_scale})")
            # 通知前端启用可视化（可选）
            if self.send_callback:
                await self.send_callback({'type': 'line_enable'})
        else:
            self.log("启用循线失败，请先加载轨道")

    async def disable_line_following(self):
        """禁用循线功能"""
        self.car.disable_line_following()
        self.log("已禁用循线功能")
        # 通知前端禁用可视化（可选）
        if self.send_callback:
            await self.send_callback({'type': 'line_disable'})

    async def set_line_pid(self, kp: float, ki: float, kd: float):
        """设置 PID 参数"""
        if self._check_stopped():
            return
        self.car.pid_kp = kp
        self.car.pid_ki = ki
        self.car.pid_kd = kd
        self.log(f"已设置 PID 参数: Kp={kp}, Ki={ki}, Kd={kd}")

    async def set_steering_scale(self, scale: float):
        """设置转向缩放系数"""
        if self._check_stopped():
            return
        self.car.steering_scale = scale
        self.log(f"已设置转向缩放: {scale}")


class SafeTimeAPI:
    """安全的时间API"""

    def __init__(self, simulator=None):
        self.simulator = simulator

    async def sleep(self, seconds: float):
        """实际异步 sleep"""
        await asyncio.sleep(seconds)


class CodeSandbox:
    """代码执行沙箱"""

    def __init__(self, car, send_callback: Callable, simulator=None):
        self.car = car
        self.send_callback = send_callback
        self.simulator = simulator
        self.is_running = False
        self.current_task = None  # 当前执行 task
        self.car_api = None  # SafeCarAPI 实例引用

    async def execute(self, code: str):
        """执行用户代码"""
        is_safe, error_msg = CodeValidator.validate(code)
        if not is_safe:
            await self.send_callback({'type': 'error', 'message': f'代码安全检查失败: {error_msg}'})
            return

        output_buffer = StringIO()

        def log_print(*args, **kwargs):
            message = ' '.join(str(arg) for arg in args)
            print(message, file=output_buffer)
            asyncio.create_task(self.send_callback({
                'type': 'log',
                'message': message,
                'level': 'info'
            }))

        safe_globals = {
            '__builtins__': {name: __builtins__[name] for name in CodeValidator.ALLOWED_BUILTINS},
            'print': log_print,
            'car': SafeCarAPI(
                self.car, 
                lambda msg: asyncio.create_task(
                    self.send_callback({'type': 'log', 'message': msg, 'level': 'info'})
                ),
                self.send_callback  # 传递 send_callback 用于循线系统
            ),
            'time': SafeTimeAPI(self.simulator if hasattr(self, 'simulator') else None),
        }

        self.car_api = safe_globals['car']  # 保存 SafeCarAPI 引用，用于 stop 中设置标志

        self.is_running = True
        self.current_task = None

        try:
            # 包装用户代码为 async def
            wrapped_code = "async def _user_code():\n" + "\n".join("    " + line for line in code.splitlines()) + "\n"
            compiled_code = compile(wrapped_code, '<user_code>', 'exec')
            exec(compiled_code, safe_globals)

            # 调用 async 用户代码
            await safe_globals['_user_code']()

            # 用户代码执行完后，等待运动完成
            max_wait_time = 15
            start_time = time.time()
            while (abs(self.car.current_speed) > 0.01 and
                   (self.car.motion_duration == 0 or
                    (time.time() - self.car.motion_start_time) < self.car.motion_duration)):
                if time.time() - start_time > max_wait_time:
                    self.car.stop()
                    await self.send_callback({
                        'type': 'warning',
                        'message': f'运动超时: 超过{max_wait_time}秒，强制停止'
                    })
                    break
                await asyncio.sleep(0.05)

            await self.send_callback({
                'type': 'complete',
                'message': '代码执行完成'
            })

        except asyncio.CancelledError:
            print("[SANDBOX] 用户代码被外部取消")
            await self.send_callback({'type': 'log', 'message': '执行被中断', 'level': 'warning'})
        except SyntaxError as e:
            await self.send_callback({'type': 'error', 'message': f'语法错误: {str(e)}'})
        except Exception as e:
            await self.send_callback({'type': 'error', 'message': f'执行错误: {str(e)}'})
        finally:
            self.is_running = False
            self.car.stop()
            self.car.current_speed = 0.0
            self.car.target_speed = 0.0
            self.car.motion_duration = 0.0
            self.car.is_moving = False
            if self.car_api:
                self.car_api._stopped = False  # 重置停止标志，为下次运行准备
            print("[SANDBOX] 执行结束，已强制清理状态")

    def stop(self):
        """停止代码执行"""
        self.is_running = False

        if self.current_task and not self.current_task.done():
            self.current_task.cancel()

        # 通过 API 设置停止标志，让后续命令无效
        if self.car_api:
            self.car_api._stopped = True
        self.car.stop()
        self.car.current_speed = 0.0
        self.car.target_speed = 0.0
        self.car.motion_duration = 0.0
        self.car.is_moving = False
        print("[SANDBOX] 强制停止完成，小车速度已清零，运动命令被禁用")
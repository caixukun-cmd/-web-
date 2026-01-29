"""
消息协议路由层
定义消息类型到处理器的映射关系
"""
from typing import Dict, Callable, Any
import json


class MessageProtocol:
    """消息协议路由器"""
    
    def __init__(self):
        # 消息类型到处理器的映射
        self.handlers: Dict[str, Callable] = {
            # 代码执行相关
            'run_code': self._handle_run_code,
            'execute_code': self._handle_run_code,
            
            # 控制相关
            'stop': self._handle_stop,
            'reset': self._handle_reset,
            
            # 地图相关
            'get_maps': self._handle_get_maps,
            'select_map': self._handle_select_map,
            
            # 归位相关
            'home': self._handle_home,
            
            # 小车控制
            'control_car': self._handle_control_car,
            
            # 轨道相关
            'track_load': self._handle_track_load,
            'track_clear': self._handle_track_clear,
            
            # 循线相关
            'line_disable': self._handle_line_disable,
        }
    
    async def route_message(self, session, message_str: str) -> bool:
        """
        路由消息到对应的处理器
            
        Args:
            session: Engine1Session 实例
            message_str: JSON 格式的消息字符串
            
        Returns:
            bool: 是否找到处理器
        """
        try:
            message = json.loads(message_str)
            msg_type = message.get('type')
                    
            if msg_type in self.handlers:
                handler = self.handlers[msg_type]
                result = await handler(session, message)  # 注意这里要 await
                return True
            else:
                print(f"未知消息类型: {msg_type}")
                return False
        except json.JSONDecodeError as e:
            print(f"JSON解析错误: {e}")
            return False
        except Exception as e:
            print(f"处理消息时发生错误: {e}")
            return False
    
    async def _handle_run_code(self, session, message: dict):
        """处理运行代码请求"""
        await session._handle_run_code(message)
    
    async def _handle_stop(self, session, message: dict):
        """处理停止请求"""
        await session._handle_stop()
    
    async def _handle_get_maps(self, session, message: dict):
        """处理获取地图列表请求"""
        await session._handle_get_maps()
    
    async def _handle_select_map(self, session, message: dict):
        """处理选择地图请求"""
        await session._handle_select_map(message)
    
    async def _handle_home(self, session, message: dict):
        """处理归位请求"""
        await session._handle_home()
    
    async def _handle_control_car(self, session, message: dict):
        """处理小车控制消息"""
        await session._handle_control_car(message)
    
    async def _handle_track_load(self, session, message: dict):
        """处理轨道加载"""
        await session._handle_track_load(message)
    
    async def _handle_track_clear(self, session, message: dict):
        """处理轨道清除"""
        await session._handle_track_clear()
    
    async def _handle_line_disable(self, session, message: dict):
        """处理循线禁用"""
        await session._handle_line_disable()
    
    async def _handle_reset(self, session, message: dict):
        """处理重置请求"""
        await session._handle_stop()


# 创建全局协议实例
PROTOCOL_ROUTER = MessageProtocol()
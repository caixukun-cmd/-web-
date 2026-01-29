"""
预留的第二引擎会话管理器
为未来扩展第二引擎做准备
"""
import asyncio
from typing import Callable


class Engine2Session:
    """第二引擎会话管理器（预留）"""
    
    def __init__(self, websocket, send_message_func: Callable):
        """
        初始化第二引擎会话
        
        Args:
            websocket: WebSocket连接对象
            send_message_func: 发送消息的回调函数
        """
        self.websocket = websocket
        self.send_message = send_message_func
        # TODO: 第二引擎的具体实现

    async def start(self):
        """启动会话"""
        pass

    async def handle_message(self, message_str: str):
        """处理接收到的消息"""
        pass

    async def cleanup(self):
        """清理会话资源"""
        pass
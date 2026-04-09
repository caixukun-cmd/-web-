"""
视觉模块
提供 YOLO 推理、帧处理、视觉评测与用户可调用的 VisionAPI。

模块说明：
- YoloService: 平台内置 YOLO11n 推理服务
- FrameHandler: 图像帧接收、缓存与预处理
- VisionEvaluator: 基础视觉评测逻辑
- VisionAPI: 提供给用户代码的统一视觉接口
"""

from .yolo_service import YoloService
from .frame_handler import FrameHandler
from .evaluator import VisionEvaluator
from .vision_api import VisionAPI

__all__ = [
    'YoloService',
    'FrameHandler',
    'VisionEvaluator',
    'VisionAPI',
]

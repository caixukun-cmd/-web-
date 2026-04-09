"""
VisionAPI
提供给用户代码使用的干净视觉接口。

该模块负责把：
- FrameHandler（帧缓存）
- YoloService（目标检测）
- VisionEvaluator（基础评测）

三部分组合成一个简单、稳定、适合沙箱暴露的统一对象。
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, Optional

import numpy as np

from .evaluator import VisionEvaluator
from .frame_handler import FrameHandler
from .yolo_service import YoloService


class VisionAPI:
    """
    暴露给用户代码的视觉接口。

    用户代码未来可直接这样使用：

    ```python
    frame = await vision.get_frame()
    result = await vision.detect()
    vision.submit_result({"detections": [...]})
    report = await vision.get_evaluation()
    ```

    设计原则：
    1. 接口尽量少，避免用户学习成本过高。
    2. 对异常给出中文错误提示。
    3. 与底层 YOLO / 帧缓存 / 评测器解耦。
    """

    def __init__(
        self,
        frame_handler: Optional[FrameHandler] = None,
        yolo_service: Optional[YoloService] = None,
        evaluator: Optional[VisionEvaluator] = None,
        simulator=None,
    ):
        """
        初始化 VisionAPI。

        Args:
            frame_handler: 帧处理器，可外部注入，未传则自动创建。
            yolo_service: YOLO 服务，可外部注入，未传则自动创建。
            evaluator: 评测器，可外部注入，未传则自动创建。
            simulator: 仿真器引用，用于评测报告补充状态快照。
        """
        self.frame_handler = frame_handler or FrameHandler()
        self.yolo_service = yolo_service or YoloService()
        self.evaluator = evaluator or VisionEvaluator(simulator=simulator)
        self.simulator = simulator

    # =========================
    # 用户要求的核心接口
    # =========================

    async def get_frame(self):
        """
        返回当前沙箱最新帧（numpy BGR）。

        Returns:
            numpy.ndarray | None

        说明：
        - 若当前还没有收到任何有效帧，则返回 None。
        - 返回的是副本，避免用户代码直接修改内部缓存。
        """
        return await self.frame_handler.get_latest_frame(copy_frame=True)

    async def detect(self, frame=None) -> Dict[str, Any]:
        """
        调用平台内置 YOLO 执行目标检测。

        Args:
            frame: 可选。
                - 如果传入 frame，则直接使用该帧检测。
                - 如果不传，则默认读取当前缓存的最新帧。

        Returns:
            标准化检测结果字典
        """
        frame_to_detect = frame

        if frame_to_detect is None:
            frame_to_detect = await self.get_frame()

        if frame_to_detect is None:
            raise RuntimeError('当前没有可用图像帧，无法执行检测')

        result = await self.yolo_service.detect(frame_to_detect)

        # 将平台检测结果同步写入评测器，便于后续 get_evaluation() 使用。
        self.evaluator.update_system_result(result)
        return result

    def submit_result(self, result: dict):
        """
        用户提交自定义检测结果。

        Args:
            result: 用户自己的检测结果

        说明：
        - 当前版本不限制用户必须与平台结果完全同构。
        - 但推荐用户至少提供 detections 列表，以便评测器比较。
        """
        self.evaluator.submit_user_result(result)

    async def get_evaluation(self) -> Dict[str, Any]:
        """
        返回简单评测报告。

        当前为异步接口，主要是为了保持和沙箱环境风格一致，
        未来若评测逻辑变复杂，也无需改用户侧调用方式。
        """
        return self.evaluator.get_evaluation_report()

    # =========================
    # 平台内部扩展接口
    # =========================

    async def update_frame(self, frame: np.ndarray, source: str = 'numpy') -> Dict[str, Any]:
        """
        平台内部使用：用 numpy 图像更新最新帧。
        """
        return await self.frame_handler.update_frame(frame, source=source)

    async def update_frame_from_base64(self, image_base64: str, source: str = 'frontend_base64') -> Dict[str, Any]:
        """
        平台内部使用：从 base64 图像更新最新帧。
        """
        return await self.frame_handler.update_frame_from_base64(image_base64, source=source)

    def update_projection_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """
        平台内部使用：写入前端基于 Three.js 真值投影得到的系统标准结果。
        """
        if not isinstance(result, dict):
            raise TypeError('投影检测结果必须是 dict 类型')

        self.evaluator.update_system_result(result)
        return result

    async def has_frame(self) -> bool:
        """判断当前是否已有可用帧。"""
        return await self.frame_handler.has_frame()

    async def clear_frame(self):
        """清空当前缓存图像帧。"""
        await self.frame_handler.clear_frame()

    def clear_evaluation(self):
        """清空当前评测缓存。"""
        self.evaluator.clear()

    async def warmup(self):
        """
        模型预热。

        说明：
        - 平台可在会话启动后异步调用该方法提前加载模型。
        - 这样用户第一次调用 detect() 时响应会更快。
        - 当前只做模型加载，不强制做 dummy inference，避免无帧情况下产生额外复杂性。
        """
        await self.yolo_service.ensure_model_loaded()

    async def get_status(self) -> Dict[str, Any]:
        """
        获取当前 VisionAPI 状态，用于调试、日志或后续管理接口。
        """
        frame_summary = await self.frame_handler.get_debug_summary()
        yolo_status = self.yolo_service.get_status()

        # 同时返回嵌套详情和扁平摘要字段。
        # 这样既方便后端保留完整调试信息，也方便前端直接展示关键状态。
        return {
            'hasFrame': frame_summary.get('has_frame', False),
            'modelReady': yolo_status.get('is_loaded', False),
            'device': yolo_status.get('device', 'cpu'),
            'frame_handler': frame_summary,
            'yolo_service': yolo_status,
            'evaluator_has_system_result': self.evaluator.get_last_system_result() is not None,
            'evaluator_has_user_result': self.evaluator.get_last_user_result() is not None,
        }

    async def close(self):
        """
        释放视觉模块资源。

        当前会做：
        - 清空帧缓存
        - 清空评测缓存
        - 释放 YOLO 模型引用并尝试清理显存
        """
        await self.clear_frame()
        self.clear_evaluation()
        await self.yolo_service.close()

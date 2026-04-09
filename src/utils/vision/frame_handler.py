"""
帧处理器
负责接收、缓存和预处理来自前端的图像帧。

设计目标：
1. 统一管理“当前最新帧”，供 VisionAPI 调用。
2. 支持直接写入 numpy 图像帧。
3. 支持从前端传入 base64 编码图像并解码为 OpenCV BGR 格式。
4. 提供基础的图像尺寸限制与帧有效性校验。
5. 尽量减少不必要的深拷贝，控制内存占用。
"""

from __future__ import annotations

import asyncio
import base64
import time
from typing import Any, Dict, Optional, Tuple

import numpy as np

try:
    import cv2
except Exception:  # pragma: no cover
    cv2 = None


class FrameHandler:
    """
    帧处理器。

    这个类负责在后端维护“最近一帧”的统一缓存。
    视觉模块后续的所有检测、评测都从这里取图像，避免到处散落地处理帧。
    """

    def __init__(
        self,
        max_width: int = 1280,
        max_height: int = 720,
        jpeg_quality: int = 85,
    ):
        """
        初始化帧处理器。

        Args:
            max_width: 允许缓存的最大图像宽度。超过时将自动缩放。
            max_height: 允许缓存的最大图像高度。超过时将自动缩放。
            jpeg_quality: 当前预留参数，便于未来做图像重编码或压缩。
        """
        self.max_width = max_width
        self.max_height = max_height
        self.jpeg_quality = jpeg_quality

        # 最新帧，统一约定为 numpy BGR 图像。
        self._latest_frame: Optional[np.ndarray] = None

        # 最近一帧的元信息，便于调试、评测和状态展示。
        self._last_frame_info: Dict[str, Any] = {
            'timestamp': None,
            'width': None,
            'height': None,
            'source': None,
        }

        # 使用 asyncio 锁，避免并发读写帧时出现竞态问题。
        self._lock = asyncio.Lock()

    # =========================
    # 基础工具方法
    # =========================

    def _ensure_cv2_available(self):
        """确保 OpenCV 可用。"""
        if cv2 is None:
            raise RuntimeError(
                '未检测到 opencv-python 依赖，无法解码图像帧。'
                '请先安装 opencv-python 后再使用视觉模块。'
            )

    def _validate_frame_array(self, frame: np.ndarray):
        """
        校验帧数组是否合法。

        当前平台统一要求：
        - 类型为 numpy.ndarray
        - 维度为 H x W x 3
        - 颜色格式为 BGR
        """
        if frame is None:
            raise ValueError('图像帧不能为空')

        if not isinstance(frame, np.ndarray):
            raise TypeError('图像帧必须是 numpy.ndarray 类型')

        if frame.ndim != 3 or frame.shape[2] != 3:
            raise ValueError('图像帧必须是 H x W x 3 格式的彩色图像')

        if frame.dtype != np.uint8:
            # 为了兼容性，这里做一次安全转换，而不是直接报错。
            frame = frame.astype(np.uint8)

        return frame

    def _resize_if_needed(self, frame: np.ndarray) -> np.ndarray:
        """
        当图像过大时进行等比缩放。

        原因：
        - 过大的输入图像会显著增加 YOLO 推理耗时。
        - 对教学平台而言，720p 左右通常足够。
        """
        height, width = frame.shape[:2]

        if width <= self.max_width and height <= self.max_height:
            return frame

        self._ensure_cv2_available()

        scale_w = self.max_width / width
        scale_h = self.max_height / height
        scale = min(scale_w, scale_h)

        new_width = max(1, int(width * scale))
        new_height = max(1, int(height * scale))

        resized = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_AREA)
        return resized

    def _strip_data_url_prefix(self, data: str) -> str:
        """
        去除 data URL 前缀。

        前端常见格式：
        data:image/jpeg;base64,/9j/4AAQSk...
        """
        if ',' in data and data.startswith('data:'):
            return data.split(',', 1)[1]
        return data

    def _decode_base64_image_sync(self, image_base64: str) -> np.ndarray:
        """
        将 base64 图片解码为 BGR 图像。

        Returns:
            numpy.ndarray，格式为 BGR
        """
        self._ensure_cv2_available()

        if not image_base64:
            raise ValueError('base64 图像数据不能为空')

        pure_base64 = self._strip_data_url_prefix(image_base64)

        try:
            image_bytes = base64.b64decode(pure_base64)
        except Exception as exc:
            raise ValueError(f'base64 图像解码失败: {exc}') from exc

        np_buffer = np.frombuffer(image_bytes, dtype=np.uint8)
        frame = cv2.imdecode(np_buffer, cv2.IMREAD_COLOR)

        if frame is None:
            raise ValueError('图像解码失败，无法从 base64 数据恢复有效图像')

        return frame

    def _build_frame_info(self, frame: np.ndarray, source: str) -> Dict[str, Any]:
        """根据当前帧构建元信息。"""
        height, width = frame.shape[:2]
        return {
            'timestamp': time.time(),
            'width': width,
            'height': height,
            'source': source,
        }

    # =========================
    # 对外公开接口
    # =========================

    async def update_frame(self, frame: np.ndarray, source: str = 'numpy') -> Dict[str, Any]:
        """
        使用 numpy 图像直接更新最新帧。

        Args:
            frame: numpy BGR 图像
            source: 帧来源说明，便于调试

        Returns:
            最新帧元信息
        """
        checked_frame = self._validate_frame_array(frame)
        checked_frame = self._resize_if_needed(checked_frame)

        async with self._lock:
            # 这里使用 copy()，避免外部持有同一数组引用并继续修改内容。
            self._latest_frame = checked_frame.copy()
            self._last_frame_info = self._build_frame_info(self._latest_frame, source)
            return dict(self._last_frame_info)

    async def update_frame_from_base64(self, image_base64: str, source: str = 'frontend_base64') -> Dict[str, Any]:
        """
        从前端传来的 base64 图片字符串更新当前帧。

        适合后续 WebSocket 上传单帧、截图或 Canvas 图像场景。
        """
        frame = await asyncio.to_thread(self._decode_base64_image_sync, image_base64)
        return await self.update_frame(frame, source=source)

    async def get_latest_frame(self, copy_frame: bool = True) -> Optional[np.ndarray]:
        """
        获取当前缓存的最新帧。

        Args:
            copy_frame: 是否返回副本。
                - True：更安全，调用方修改不会影响缓存。
                - False：更节省内存，但调用方必须自行保证不修改内容。
        """
        async with self._lock:
            if self._latest_frame is None:
                return None
            return self._latest_frame.copy() if copy_frame else self._latest_frame

    async def get_last_frame_info(self) -> Dict[str, Any]:
        """获取最近帧的元信息。"""
        async with self._lock:
            return dict(self._last_frame_info)

    async def has_frame(self) -> bool:
        """判断当前是否已有可用帧。"""
        async with self._lock:
            return self._latest_frame is not None

    async def clear_frame(self):
        """
        清空当前缓存帧。

        适用于：
        - 用户重置会话
        - 切换场景
        - 退出沙箱
        """
        async with self._lock:
            self._latest_frame = None
            self._last_frame_info = {
                'timestamp': None,
                'width': None,
                'height': None,
                'source': None,
            }

    async def get_debug_summary(self) -> Dict[str, Any]:
        """
        返回适合日志输出或调试面板展示的摘要信息。
        """
        info = await self.get_last_frame_info()
        return {
            'has_frame': await self.has_frame(),
            'frame_info': info,
            'max_width': self.max_width,
            'max_height': self.max_height,
        }

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
import time
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
        self._last_obstacle_truth: Optional[Dict[str, Any]] = None

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

    def _normalize_projection_bbox(self, detection: Dict[str, Any]) -> Optional[Dict[str, float]]:
        bbox = detection.get('bbox')
        if not isinstance(bbox, dict):
            return None

        try:
            x1 = float(bbox.get('x1', 0))
            y1 = float(bbox.get('y1', 0))
            x2 = float(bbox.get('x2', 0))
            y2 = float(bbox.get('y2', 0))
        except (TypeError, ValueError):
            return None

        if x2 <= x1 or y2 <= y1:
            return None

        return {
            'x1': x1,
            'y1': y1,
            'x2': x2,
            'y2': y2,
            'width': x2 - x1,
            'height': y2 - y1,
        }

    async def get_obstacles(self, max_age_ms: Optional[float] = None) -> Dict[str, Any]:
        """
        获取基于 3D 场景投影生成的视觉障碍物列表。

        说明：
        - 该接口优先使用前端 Three.js 真值投影写入的 system_result。
        - 不依赖 YOLO 是否能识别仿真灰色方块，因此更适合稳定演示视觉避障。
        - 用户需要先切换到车前视角，并开启视觉采集/投影链路。
        - max_age_ms 可用于丢弃刷新、重置后残留的旧投影结果。
        """
        result = self.evaluator.get_last_system_result() or {}
        timestamp = result.get('timestamp') if isinstance(result, dict) else None
        if max_age_ms is not None and timestamp is not None:
            try:
                age_ms = time.time() * 1000.0 - float(timestamp)
                if age_ms > float(max_age_ms):
                    return {
                        'source': result.get('model', 'sim-ground-truth-detector') if isinstance(result, dict) else 'unknown',
                        'timestamp': timestamp,
                        'stale': True,
                        'age_ms': round(age_ms, 1),
                        'frame_width': 640.0,
                        'frame_height': 480.0,
                        'count': 0,
                        'obstacles': [],
                    }
            except (TypeError, ValueError):
                pass

        detections = result.get('detections', []) if isinstance(result, dict) else []
        if not isinstance(detections, list):
            detections = []

        frame_info = await self.frame_handler.get_last_frame_info()
        image_info = result.get('image') if isinstance(result.get('image'), dict) else {}
        frame_width = image_info.get('width') or result.get('frame_width') or frame_info.get('width') or 640
        frame_height = image_info.get('height') or result.get('frame_height') or frame_info.get('height') or 480

        try:
            frame_width = max(1.0, float(frame_width))
            frame_height = max(1.0, float(frame_height))
        except (TypeError, ValueError):
            frame_width = 640.0
            frame_height = 480.0

        obstacles = []
        for item in detections:
            if not isinstance(item, dict):
                continue

            class_name = item.get('class_name') or item.get('label') or item.get('name')
            if class_name not in {'obstacle', 'box', 'cube', 'barrier'}:
                continue

            bbox = self._normalize_projection_bbox(item)
            if bbox is None:
                continue

            center_x = (bbox['x1'] + bbox['x2']) / 2.0
            center_y = (bbox['y1'] + bbox['y2']) / 2.0
            area = bbox['width'] * bbox['height']
            area_ratio = area / (frame_width * frame_height)
            horizontal_ratio = center_x / frame_width

            spatial = item.get('spatial') if isinstance(item.get('spatial'), dict) else {}
            spatial_direction = spatial.get('direction')
            if spatial_direction in {'left', 'right', 'center'}:
                direction = spatial_direction
            elif horizontal_ratio < 0.4:
                direction = 'left'
            elif horizontal_ratio > 0.6:
                direction = 'right'
            else:
                direction = 'center'

            if area_ratio >= 0.18:
                distance_level = 'very_near'
            elif area_ratio >= 0.08:
                distance_level = 'near'
            elif area_ratio >= 0.025:
                distance_level = 'middle'
            else:
                distance_level = 'far'

            obstacle = {
                'found': True,
                'obstacle_id': item.get('obstacle_id'),
                'class_name': class_name,
                'confidence': float(item.get('confidence', 1.0) or 1.0),
                'bbox': bbox,
                'center_x': round(center_x, 2),
                'center_y': round(center_y, 2),
                'area': round(area, 2),
                'area_ratio': round(area_ratio, 5),
                'horizontal_ratio': round(horizontal_ratio, 4),
                'direction': direction,
                'distance_level': distance_level,
            }

            if spatial:
                for source_key, target_key in [
                    ('distance', 'distance'),
                    ('forward_distance', 'forward_distance'),
                    ('lateral_offset', 'lateral_offset'),
                    ('is_ahead', 'is_ahead'),
                    ('world_position', 'world_position'),
                ]:
                    if source_key in spatial:
                        obstacle[target_key] = spatial.get(source_key)

                try:
                    forward_distance = float(spatial.get('forward_distance'))
                    if forward_distance <= 1.0:
                        obstacle['distance_level'] = 'very_near'
                    elif forward_distance <= 2.2:
                        obstacle['distance_level'] = 'near'
                    elif forward_distance <= 4.5:
                        obstacle['distance_level'] = 'middle'
                    else:
                        obstacle['distance_level'] = 'far'
                except (TypeError, ValueError):
                    pass

            obstacles.append(obstacle)

        def obstacle_sort_distance(item):
            try:
                return float(item.get('forward_distance'))
            except (TypeError, ValueError):
                return 999999.0

        obstacles.sort(key=obstacle_sort_distance)

        return {
            'source': result.get('model', 'sim-ground-truth-detector') if isinstance(result, dict) else 'unknown',
            'timestamp': result.get('timestamp') if isinstance(result, dict) else None,
            'frame_width': frame_width,
            'frame_height': frame_height,
            'count': len(obstacles),
            'obstacles': obstacles,
        }

    async def get_nearest_obstacle(self) -> Dict[str, Any]:
        """
        返回画面中面积最大的障碍物，作为视觉避障中的最近障碍物近似。
        """
        obstacle_result = await self.get_obstacles()
        obstacles = obstacle_result.get('obstacles', [])
        if not obstacles:
            return {
                'found': False,
                'source': obstacle_result.get('source'),
                'timestamp': obstacle_result.get('timestamp'),
                'message': '当前视觉投影结果中未发现障碍物',
            }

        nearest = dict(obstacles[0])
        nearest.update({
            'found': True,
            'source': obstacle_result.get('source'),
            'timestamp': obstacle_result.get('timestamp'),
            'frame_width': obstacle_result.get('frame_width'),
            'frame_height': obstacle_result.get('frame_height'),
            'count': obstacle_result.get('count'),
        })
        return nearest

    async def has_obstacle_ahead(self, area_threshold: float = 0.025) -> bool:
        """
        判断车前视觉范围内是否存在需要避让的障碍物。
        """
        obstacle = await self.get_nearest_obstacle()
        return bool(obstacle.get('found') and float(obstacle.get('area_ratio') or 0.0) >= area_threshold)

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

    def update_obstacle_truth(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """
        平台内部使用：写入前端同步的障碍物真值坐标。

        该结果不依赖相机视角、视觉采集或 bbox 投影，可用于稳定的坐标避障。
        """
        if not isinstance(result, dict):
            raise TypeError('障碍物真值结果必须是 dict 类型')

        self._last_obstacle_truth = result
        return result

    async def get_obstacle_truth(self, max_age_ms: Optional[float] = 700.0) -> Dict[str, Any]:
        """
        获取当前场景障碍物真值坐标列表。

        返回字段中的 forward_distance / lateral_offset 已经是相对小车坐标，
        用户避障代码可直接按这些值判断，无需依赖视觉框面积或相机视角。
        """
        result = self._last_obstacle_truth or {}
        timestamp = result.get('timestamp') if isinstance(result, dict) else None

        if max_age_ms is not None and timestamp is not None:
            try:
                age_ms = time.time() * 1000.0 - float(timestamp)
                if age_ms > float(max_age_ms):
                    return {
                        'source': result.get('model', 'sim-world-truth-obstacles') if isinstance(result, dict) else 'unknown',
                        'timestamp': timestamp,
                        'stale': True,
                        'age_ms': round(age_ms, 1),
                        'count': 0,
                        'obstacles': [],
                    }
            except (TypeError, ValueError):
                pass

        obstacles = result.get('obstacles', []) if isinstance(result, dict) else []
        if not isinstance(obstacles, list):
            obstacles = []

        return {
            'source': result.get('model', 'sim-world-truth-obstacles') if isinstance(result, dict) else 'unknown',
            'timestamp': timestamp,
            'stale': False,
            'car': result.get('car', {}) if isinstance(result.get('car'), dict) else {},
            'count': len(obstacles),
            'obstacles': [dict(item) for item in obstacles if isinstance(item, dict)],
        }

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
        self._last_obstacle_truth = None

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

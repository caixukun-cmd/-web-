"""
YOLO 模型服务
负责模型加载、推理执行、设备选择与显存清理。

设计目标：
1. 为平台提供一个内置的 YOLO11n 基础检测能力。
2. 优先使用 GPU（CUDA），不可用时自动回退到 CPU。
3. 对外暴露一个清晰、稳定、异步友好的服务接口。
4. 尽量减少显存长期占用，定期做缓存清理。
5. 发生异常时给出明确的中文错误，便于调试与答辩讲解。
"""

from __future__ import annotations

import asyncio
import threading
import time
from typing import Any, Dict, List, Optional

import numpy as np

try:
    import torch
except Exception:  # pragma: no cover - 允许在未安装 torch 时优雅报错
    torch = None

try:
    from ultralytics import YOLO
except Exception:  # pragma: no cover - 允许在未安装 ultralytics 时优雅报错
    YOLO = None


class YoloService:
    """
    YOLO 推理核心服务。

    说明：
    - 该类采用“懒加载”方式：只有第一次真正调用推理时才加载模型。
    - 这样可以避免系统启动时就占用较大内存/显存。
    - 由于 WebSocket 与用户代码都可能并发访问，这里使用线程锁保护模型加载与推理过程。
    """

    def __init__(
        self,
        model_name: str = 'yolo11n.pt',
        prefer_gpu: bool = True,
        cleanup_interval: int = 20,
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.45,
        max_det: int = 100,
    ):
        """
        初始化 YOLO 服务。

        Args:
            model_name: 平台内置 YOLO 模型名称，默认使用 yolo11n.pt。
            prefer_gpu: 是否优先使用 GPU。
            cleanup_interval: 每执行多少次推理后主动清理一次缓存。
            conf_threshold: 目标检测置信度阈值。
            iou_threshold: NMS 的 IoU 阈值。
            max_det: 单帧最多保留多少个检测框。
        """
        self.model_name = model_name
        self.prefer_gpu = prefer_gpu
        self.cleanup_interval = cleanup_interval
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.max_det = max_det

        # 模型实例。第一次使用前为 None。
        self._model = None

        # 记录当前使用的设备字符串，例如：cuda:0 / cpu
        self._device = 'cpu'

        # 推理计数，用于定期清理缓存。
        self._infer_count = 0

        # 最近一次推理时间，便于将来做性能统计。
        self._last_infer_time = 0.0

        # 使用线程锁保护模型加载和推理，避免并发条件下重复初始化模型。
        self._lock = threading.Lock()

    # =========================
    # 基础信息接口
    # =========================

    @property
    def device(self) -> str:
        """返回当前模型所在设备。"""
        return self._device

    @property
    def is_loaded(self) -> bool:
        """判断模型是否已完成加载。"""
        return self._model is not None

    def get_status(self) -> Dict[str, Any]:
        """
        返回当前 YOLO 服务运行状态。

        这个接口便于后续调试、日志输出和答辩展示。
        """
        return {
            'model_name': self.model_name,
            'is_loaded': self.is_loaded,
            'device': self._device,
            'infer_count': self._infer_count,
            'last_infer_time_ms': round(self._last_infer_time * 1000, 2),
            'prefer_gpu': self.prefer_gpu,
            'conf_threshold': self.conf_threshold,
            'iou_threshold': self.iou_threshold,
            'max_det': self.max_det,
        }

    # =========================
    # 模型加载相关
    # =========================

    def _select_device(self) -> str:
        """
        选择推理设备。

        优先级：
        1. 用户允许 GPU 且 torch.cuda 可用 -> 使用 cuda:0
        2. 否则回退到 cpu
        """
        if self.prefer_gpu and torch is not None and torch.cuda.is_available():
            return 'cuda:0'
        return 'cpu'

    def _ensure_dependencies(self):
        """
        检查推理依赖是否存在。

        如果依赖缺失，不在这里直接崩溃，而是抛出可读性更强的中文异常。
        """
        if YOLO is None:
            raise RuntimeError(
                '未检测到 ultralytics 依赖，无法加载 YOLO11n。'
                '请先安装 ultralytics 后再使用视觉模块。'
            )

        if torch is None:
            raise RuntimeError(
                '未检测到 torch 依赖，无法执行 YOLO 推理。'
                '请先安装 torch 后再使用视觉模块。'
            )

    def load_model(self):
        """
        同步加载模型。

        注意：
        - 这是一个同步方法，供内部线程调用。
        - 外部如果在异步环境中使用，应该调用 async ensure_model_loaded()。
        """
        with self._lock:
            # 双重检查，防止并发时重复加载。
            if self._model is not None:
                return self._model

            self._ensure_dependencies()

            selected_device = self._select_device()

            try:
                model = YOLO(self.model_name)
                # Ultralytics 支持通过 .to() 将模型迁移到目标设备。
                model.to(selected_device)
                self._model = model
                self._device = selected_device
            except Exception as exc:
                # 如果 GPU 初始化失败，则自动降级到 CPU。
                if selected_device.startswith('cuda'):
                    fallback_device = 'cpu'
                    model = YOLO(self.model_name)
                    model.to(fallback_device)
                    self._model = model
                    self._device = fallback_device
                else:
                    raise RuntimeError(f'YOLO 模型加载失败: {exc}') from exc

            return self._model

    async def ensure_model_loaded(self):
        """
        异步确保模型已加载。

        使用 asyncio.to_thread 避免阻塞事件循环。
        """
        if self._model is not None:
            return self._model
        return await asyncio.to_thread(self.load_model)

    # =========================
    # 推理相关
    # =========================

    def _validate_frame(self, frame: np.ndarray):
        """
        校验输入帧格式。

        当前约定：
        - 输入必须是 numpy.ndarray
        - 必须是 H x W x 3 的 BGR 图像
        """
        if frame is None:
            raise ValueError('输入帧不能为空')

        if not isinstance(frame, np.ndarray):
            raise TypeError('输入帧必须是 numpy.ndarray 类型')

        if frame.ndim != 3 or frame.shape[2] != 3:
            raise ValueError('输入帧必须是 H x W x 3 的 BGR 彩色图像')

    def _format_results(self, raw_results: Any) -> Dict[str, Any]:
        """
        将 Ultralytics 原始结果格式化为平台内部统一结构。

        返回的数据尽量简洁、稳定，便于：
        - 用户代码直接读取
        - evaluator 做评分
        - WebSocket / API 输出
        """
        detections: List[Dict[str, Any]] = []

        if not raw_results:
            return {
                'model': self.model_name,
                'device': self._device,
                'count': 0,
                'detections': detections,
                'timestamp': time.time(),
            }

        result = raw_results[0]
        names = getattr(result, 'names', {}) or {}
        boxes = getattr(result, 'boxes', None)

        if boxes is not None:
            xyxy_list = boxes.xyxy.detach().cpu().tolist() if boxes.xyxy is not None else []
            conf_list = boxes.conf.detach().cpu().tolist() if boxes.conf is not None else []
            cls_list = boxes.cls.detach().cpu().tolist() if boxes.cls is not None else []

            for idx, xyxy in enumerate(xyxy_list):
                cls_id = int(cls_list[idx]) if idx < len(cls_list) else -1
                confidence = float(conf_list[idx]) if idx < len(conf_list) else 0.0
                x1, y1, x2, y2 = [float(v) for v in xyxy]

                detections.append({
                    'class_id': cls_id,
                    'class_name': names.get(cls_id, str(cls_id)),
                    'confidence': round(confidence, 6),
                    'bbox': {
                        'x1': round(x1, 3),
                        'y1': round(y1, 3),
                        'x2': round(x2, 3),
                        'y2': round(y2, 3),
                        'width': round(max(0.0, x2 - x1), 3),
                        'height': round(max(0.0, y2 - y1), 3),
                    }
                })

        return {
            'model': self.model_name,
            'device': self._device,
            'count': len(detections),
            'detections': detections,
            'timestamp': time.time(),
        }

    def _cleanup_cache_sync(self, force: bool = False):
        """
        同步清理缓存。

        说明：
        - CPU 下基本无需特殊处理。
        - CUDA 下适当 empty_cache() 有助于缓解长期运行后的显存碎片问题。
        - 这里不在每一帧后都清理，否则会影响吞吐性能。
        """
        if torch is None:
            return

        if self._device.startswith('cuda') and torch.cuda.is_available():
            if force or (self.cleanup_interval > 0 and self._infer_count % self.cleanup_interval == 0):
                try:
                    torch.cuda.empty_cache()
                    # IPC 缓存回收可以进一步释放跨进程共享缓存。
                    if hasattr(torch.cuda, 'ipc_collect'):
                        torch.cuda.ipc_collect()
                except Exception:
                    # 清理缓存不应影响主流程，因此这里静默处理。
                    pass

    async def cleanup_cache(self, force: bool = False):
        """异步清理缓存。"""
        await asyncio.to_thread(self._cleanup_cache_sync, force)

    def detect_sync(self, frame: np.ndarray) -> Dict[str, Any]:
        """
        同步执行单帧检测。

        Args:
            frame: numpy BGR 图像

        Returns:
            统一格式的检测结果字典
        """
        self._validate_frame(frame)
        model = self.load_model()

        start_time = time.perf_counter()

        with self._lock:
            raw_results = model.predict(
                source=frame,
                conf=self.conf_threshold,
                iou=self.iou_threshold,
                max_det=self.max_det,
                verbose=False,
                device=self._device,
            )

        self._infer_count += 1
        self._last_infer_time = time.perf_counter() - start_time

        result = self._format_results(raw_results)
        # 同时保留 infer_time_ms 与更前端友好的 inferenceMs 字段，
        # 避免不同层之间因为命名风格不同而出现协议不一致。
        infer_time_ms = round(self._last_infer_time * 1000, 3)
        result['infer_time_ms'] = infer_time_ms
        result['inferenceMs'] = infer_time_ms

        # 定期清理缓存，降低长时间运行时的显存压力。
        self._cleanup_cache_sync(force=False)
        return result

    async def detect(self, frame: np.ndarray) -> Dict[str, Any]:
        """
        异步执行检测。

        使用线程池包装同步推理，避免阻塞 WebSocket / sandbox 主事件循环。
        """
        return await asyncio.to_thread(self.detect_sync, frame)

    async def close(self):
        """
        主动释放模型引用并清理缓存。

        适用于会话结束、服务销毁、用户退出等场景。
        """
        with self._lock:
            self._model = None

        await self.cleanup_cache(force=True)

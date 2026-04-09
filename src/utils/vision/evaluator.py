"""
视觉评测器
结合检测结果与仿真状态生成基础评测报告。

当前定位：
1. 不做复杂学术指标，只做平台内“够用、清晰、可讲解”的基础评测。
2. 同时记录：
   - 平台内置 YOLO 的检测结果
   - 用户通过 VisionAPI.submit_result() 提交的自定义结果
3. 给出一个简单的比较报告，便于课程演示和后续扩展。
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional


class VisionEvaluator:
    """
    基础视觉评测器。

    说明：
    - 本评测器不追求严格的 mAP 等复杂指标。
    - 当前更适合教学演示：比较“平台检测结果”和“用户提交结果”是否一致、目标数量是否接近、类别是否匹配。
    - 后续如果需要，可以在这个类内部继续升级为 IoU 匹配、Precision / Recall 等更正式的指标。
    """

    def __init__(self, simulator=None):
        """
        初始化评测器。

        Args:
            simulator: 可选的仿真器引用，用于生成带仿真状态的评测报告。
        """
        self.simulator = simulator

        # 最近一次平台内置 YOLO 检测结果
        self._last_system_result: Optional[Dict[str, Any]] = None

        # 最近一次用户提交结果
        self._last_user_result: Optional[Dict[str, Any]] = None

        # 结果更新时间戳，便于调试与报告展示
        self._system_result_time: Optional[float] = None
        self._user_result_time: Optional[float] = None

    # =========================
    # 结果写入接口
    # =========================

    def update_system_result(self, result: Dict[str, Any]):
        """
        写入平台内置 YOLO 的检测结果。
        """
        self._last_system_result = result
        self._system_result_time = time.time()

    def submit_user_result(self, result: Dict[str, Any]):
        """
        写入用户自定义提交的结果。

        约定：
        - 用户提交内容必须是 dict
        - 推荐结构：
          {
              "detections": [
                  {
                      "class_name": "person",
                      "confidence": 0.92,
                      "bbox": {"x1": 1, "y1": 2, "x2": 3, "y2": 4}
                  }
              ]
          }
        """
        if not isinstance(result, dict):
            raise TypeError('用户提交结果必须是 dict 类型')

        self._last_user_result = result
        self._user_result_time = time.time()

    # =========================
    # 基础读取接口
    # =========================

    def get_last_system_result(self) -> Optional[Dict[str, Any]]:
        """获取最近一次平台检测结果。"""
        return self._last_system_result

    def get_last_user_result(self) -> Optional[Dict[str, Any]]:
        """获取最近一次用户提交结果。"""
        return self._last_user_result

    def _extract_detections(self, result: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        从结果中提取 detections 列表。

        为了兼容未来不同风格的结果格式，这里做一层柔性处理。
        """
        if not result:
            return []

        detections = result.get('detections', [])
        if isinstance(detections, list):
            return detections
        return []

    def _extract_class_names(self, detections: List[Dict[str, Any]]) -> List[str]:
        """
        从检测结果中提取类别名称列表。
        """
        class_names: List[str] = []
        for item in detections:
            class_name = item.get('class_name') or item.get('label') or item.get('name')
            if class_name is not None:
                class_names.append(str(class_name))
        return class_names

    def _count_by_class(self, class_names: List[str]) -> Dict[str, int]:
        """
        统计每个类别出现次数。
        """
        result: Dict[str, int] = {}
        for class_name in class_names:
            result[class_name] = result.get(class_name, 0) + 1
        return result

    def _extract_bbox(self, detection: Dict[str, Any]) -> Optional[Dict[str, float]]:
        bbox = detection.get('bbox')
        if not isinstance(bbox, dict):
            return None

        required_keys = ('x1', 'y1', 'x2', 'y2')
        if any(key not in bbox for key in required_keys):
            return None

        try:
            x1 = float(bbox['x1'])
            y1 = float(bbox['y1'])
            x2 = float(bbox['x2'])
            y2 = float(bbox['y2'])
        except (TypeError, ValueError):
            return None

        if x2 <= x1 or y2 <= y1:
            return None

        return {'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2}

    def _compute_iou(self, box_a: Dict[str, float], box_b: Dict[str, float]) -> float:
        inter_x1 = max(box_a['x1'], box_b['x1'])
        inter_y1 = max(box_a['y1'], box_b['y1'])
        inter_x2 = min(box_a['x2'], box_b['x2'])
        inter_y2 = min(box_a['y2'], box_b['y2'])

        inter_width = max(0.0, inter_x2 - inter_x1)
        inter_height = max(0.0, inter_y2 - inter_y1)
        inter_area = inter_width * inter_height

        if inter_area <= 0:
            return 0.0

        area_a = (box_a['x2'] - box_a['x1']) * (box_a['y2'] - box_a['y1'])
        area_b = (box_b['x2'] - box_b['x1']) * (box_b['y2'] - box_b['y1'])
        union_area = area_a + area_b - inter_area

        if union_area <= 0:
            return 0.0

        return inter_area / union_area

    def _build_bbox_match_report(self, system_detections: List[Dict[str, Any]], user_detections: List[Dict[str, Any]], iou_threshold: float = 0.5) -> Dict[str, Any]:
        if not user_detections:
            return {
                'status': 'no_user_result',
                'iou_threshold': iou_threshold,
                'matched': 0,
                'missed': len(system_detections),
                'false_positive': 0,
                'precision': None,
                'recall': None,
                'matches': [],
                'missed_indices': list(range(len(system_detections))),
                'false_positive_indices': [],
                'message': '用户尚未提交 bbox 结果，无法进行命中评测',
            }

        used_user_indices = set()
        matches = []
        missed_indices = []

        for system_idx, system_item in enumerate(system_detections):
            system_bbox = self._extract_bbox(system_item)
            system_class = system_item.get('class_name') or system_item.get('label') or system_item.get('name')
            if system_bbox is None:
                missed_indices.append(system_idx)
                continue

            best_iou = 0.0
            best_user_idx = None

            for user_idx, user_item in enumerate(user_detections):
                if user_idx in used_user_indices:
                    continue

                user_class = user_item.get('class_name') or user_item.get('label') or user_item.get('name')
                if str(user_class) != str(system_class):
                    continue

                user_bbox = self._extract_bbox(user_item)
                if user_bbox is None:
                    continue

                iou = self._compute_iou(system_bbox, user_bbox)
                if iou > best_iou:
                    best_iou = iou
                    best_user_idx = user_idx

            if best_user_idx is not None and best_iou >= iou_threshold:
                used_user_indices.add(best_user_idx)
                matches.append({
                    'system_index': system_idx,
                    'user_index': best_user_idx,
                    'class_name': system_class,
                    'iou': round(best_iou, 4),
                })
            else:
                missed_indices.append(system_idx)

        false_positive_indices = [idx for idx in range(len(user_detections)) if idx not in used_user_indices]

        matched = len(matches)
        missed = len(missed_indices)
        false_positive = len(false_positive_indices)
        precision = matched / (matched + false_positive) if (matched + false_positive) > 0 else None
        recall = matched / (matched + missed) if (matched + missed) > 0 else None

        return {
            'status': 'evaluated',
            'iou_threshold': iou_threshold,
            'matched': matched,
            'missed': missed,
            'false_positive': false_positive,
            'precision': round(precision, 4) if precision is not None else None,
            'recall': round(recall, 4) if recall is not None else None,
            'matches': matches,
            'missed_indices': missed_indices,
            'false_positive_indices': false_positive_indices,
            'message': '已完成基于 bbox 的基础命中评测',
        }

    def _build_simulator_snapshot(self) -> Dict[str, Any]:
        """
        生成当前仿真器状态快照。

        这样在答辩时可以说明：
        视觉评测不仅返回“识别到了什么”，还能关联“识别发生时小车处于什么状态”。
        """
        if self.simulator is None:
            return {
                'available': False,
                'state': None,
            }

        try:
            state = self.simulator.get_state()
            return {
                'available': True,
                'state': state,
            }
        except Exception as exc:
            return {
                'available': False,
                'state': None,
                'error': str(exc),
            }

    def _build_basic_score(self, bbox_match_report: Dict[str, Any], system_classes: Dict[str, int], user_classes: Dict[str, int]) -> Dict[str, Any]:
        """
        构建一个基础评分结果。

        当前策略更适合路线 C2：
        - 先依据 bbox 匹配统计命中、漏检、误检
        - 再结合类别统计生成简洁易解释的教学评分
        """
        if not user_classes:
            return {
                'score': None,
                'status': 'no_user_result',
                'message': '用户尚未提交自定义检测结果，无法进行对比评测',
            }

        matched = bbox_match_report.get('matched', 0)
        missed = bbox_match_report.get('missed', 0)
        false_positive = bbox_match_report.get('false_positive', 0)

        total_penalty = missed * 25 + false_positive * 15

        class_details = []
        all_classes = set(system_classes.keys()) | set(user_classes.keys())
        for class_name in sorted(all_classes):
            system_count = system_classes.get(class_name, 0)
            user_count = user_classes.get(class_name, 0)
            class_details.append({
                'class_name': class_name,
                'system_count': system_count,
                'user_count': user_count,
                'difference': abs(system_count - user_count),
            })

        score = max(0.0, 100.0 - float(total_penalty))
        return {
            'score': round(score, 2),
            'status': 'evaluated',
            'message': '已完成基础 bbox 命中评测',
            'matched': matched,
            'missed': missed,
            'false_positive': false_positive,
            'details': class_details,
        }

    # =========================
    # 对外主接口
    # =========================

    def get_evaluation_report(self) -> Dict[str, Any]:
        """
        获取当前评测报告。

        报告内容包括：
        - 平台结果摘要
        - 用户结果摘要
        - 基础评分
        - 仿真状态快照
        """
        system_detections = self._extract_detections(self._last_system_result)
        user_detections = self._extract_detections(self._last_user_result)

        system_class_names = self._extract_class_names(system_detections)
        user_class_names = self._extract_class_names(user_detections)

        system_class_stats = self._count_by_class(system_class_names)
        user_class_stats = self._count_by_class(user_class_names)

        bbox_match_report = self._build_bbox_match_report(system_detections, user_detections)
        score_info = self._build_basic_score(bbox_match_report, system_class_stats, user_class_stats)

        return {
            'timestamp': time.time(),
            'system_result': {
                'available': self._last_system_result is not None,
                'updated_at': self._system_result_time,
                'count': len(system_detections),
                'class_stats': system_class_stats,
                'raw': self._last_system_result,
            },
            'user_result': {
                'available': self._last_user_result is not None,
                'updated_at': self._user_result_time,
                'count': len(user_detections),
                'class_stats': user_class_stats,
                'raw': self._last_user_result,
            },
            'evaluation': score_info,
            'bbox_match': bbox_match_report,
            'simulator_snapshot': self._build_simulator_snapshot(),
        }

    def clear(self):
        """
        清空已缓存的评测数据。

        适用于：
        - 新一轮评测开始前
        - 用户重置仿真任务
        - 会话结束清理
        """
        self._last_system_result = None
        self._last_user_result = None
        self._system_result_time = None
        self._user_result_time = None

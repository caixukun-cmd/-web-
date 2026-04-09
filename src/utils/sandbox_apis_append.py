from typing import Dict, Any

from .vision import VisionAPI


class SafeEnvAPI:
    """环境状态读取 API"""

    def __init__(self, simulator):
        self.simulator = simulator

    def get_state(self) -> Dict[str, Any]:
        getter = getattr(self.simulator, 'get_env_state', None)
        if callable(getter):
            return getter()
        return self.simulator.get_state()

    def is_collision(self) -> bool:
        return bool(self.get_state().get('collision', False))

    def get_collision_count(self) -> int:
        return int(self.get_state().get('collision_count', 0))

    def get_progress(self) -> Dict[str, Any]:
        state = self.get_state()
        return {
            'progress': state.get('progress', 0.0),
            'distance_to_goal': state.get('distance_to_goal'),
            'elapsed_time': state.get('elapsed_time'),
        }


class SafeTaskAPI:
    """任务信息与任务状态 API"""

    def __init__(self, simulator):
        self.simulator = simulator

    def get_info(self) -> Dict[str, Any]:
        getter = getattr(self.simulator, 'get_env_state', None)
        state = getter() if callable(getter) else self.simulator.get_state()
        map_id = state.get('map_id') or 'default'
        return {
            'task_id': f'{map_id}_driving_task',
            'name': '智能小车仿真任务',
            'description': '控制小车在当前地图中稳定运行，减少碰撞并尽可能接近终点',
            'map_id': map_id,
            'success_conditions': ['无碰撞或碰撞次数尽量少', '尽可能提升任务完成进度', '在合理时间内接近或到达终点'],
            'failure_conditions': ['碰撞次数过多', '长时间无进展', '越界或无法继续完成任务'],
            'score_items': ['progress', 'collision_count', 'distance_to_goal', 'elapsed_time'],
        }

    def is_finished(self) -> bool:
        state = self.simulator.get_env_state() if hasattr(self.simulator, 'get_env_state') else self.simulator.get_state()
        progress = float(state.get('progress') or 0.0)
        elapsed = float(state.get('elapsed_time') or 0.0)
        collision_count = int(state.get('collision_count') or 0)
        return progress >= 0.99 or collision_count >= 3 or elapsed >= 120.0

    def is_success(self) -> bool:
        state = self.simulator.get_env_state() if hasattr(self.simulator, 'get_env_state') else self.simulator.get_state()
        progress = float(state.get('progress') or 0.0)
        collision_count = int(state.get('collision_count') or 0)
        return progress >= 0.99 and collision_count == 0


class SafeJudgeAPI:
    """统一评测报告 API"""

    def __init__(self, simulator, vision: VisionAPI = None):
        self.simulator = simulator
        self.vision = vision

    def get_report(self) -> Dict[str, Any]:
        state = self.simulator.get_env_state() if hasattr(self.simulator, 'get_env_state') else self.simulator.get_state()
        progress = float(state.get('progress') or 0.0)
        collision_count = int(state.get('collision_count') or 0)
        distance_to_goal = state.get('distance_to_goal')
        elapsed_time = float(state.get('elapsed_time') or 0.0)
        passed = progress >= 0.99 and collision_count == 0

        score = 100.0
        score -= collision_count * 25.0
        score -= max(0.0, elapsed_time - 30.0) * 0.5
        if distance_to_goal is not None:
            score -= min(30.0, float(distance_to_goal) * 2.0)
        score += min(20.0, progress * 20.0)
        score = round(max(0.0, min(100.0, score)), 2)

        report = {
            'score': score,
            'passed': passed,
            'summary': '任务完成' if passed else '任务未完全达标',
            'details': {
                'progress': progress,
                'collision_count': collision_count,
                'distance_to_goal': distance_to_goal,
                'elapsed_time': round(elapsed_time, 3),
                'out_of_bounds': state.get('out_of_bounds', False),
            },
            'state': state,
        }

        if self.vision is not None:
            report['vision_evaluation_available'] = self.vision.evaluator.get_last_system_result() is not None

        return report

    def get_score(self) -> float:
        return float(self.get_report()['score'])

    def is_passed(self) -> bool:
        return bool(self.get_report()['passed'])

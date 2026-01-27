/**
 * simulator.js
 * 门面 facade：对外 export 不变（兼容现有 HTML）
 * 
 * 模块化架构说明：
 * - runtime.js: 全局状态容器
 * - scene/: 场景初始化、模型加载、窗口调整、资源释放
 * - loop/: 主循环、FPS/按需渲染
 * - net/: WebSocket 客户端
 * - car/: 小车状态、位置同步、每帧插值
 * - camera/: 相机模式切换、自由视角、重置
 * - path/: 路径记录
 * - map/: Chunk 管理、生成、更新
 * - car/sensors/: 探头系统
 * - car/control/: 循线控制、PID
 * - map/trackMap/: 轨道地图加载、采样
 * - debug/: 调试可视化
 */

// 场景
export { initScene } from './simulator/scene/initScene.js';
export { dispose } from './simulator/scene/dispose.js';

// WebSocket
export { connectWebSocket, sendMessage, isWebSocketConnected } from './simulator/net/wsClient.js';

// 相机
export { setCameraMode } from './simulator/camera/modes.js';
export { resetFreeCamera } from './simulator/camera/reset.js';

// 路径
export { clearPath, startPathRecording, stopPathRecording } from './simulator/path/recorder.js';

// 性能
export { requestRender, getFPS } from './simulator/loop/perf.js';

// 小车状态
export { getCarState } from './simulator/car/state.js';

// ===== 循线系统 API =====

// 循线主控制器
export {
    initLineFollower,
    enableLineFollower,
    disableLineFollower,
    updateLineFollower,
    getLineFollowerResult,
    getSteering,
    isLineFollowerEnabled,
    resetLineFollower,
    setLineFollowerPID,
    setSteeringScale,
    getLineFollowerConfig,
    disposeLineFollower
} from './simulator/car/control/lineFollower.js';

// 轨道加载
export {
    loadTrackFromURL,
    loadTrackData,
    loadDemoTrack,
    getTrackWaypoints,
    getTrackWidth,
    isTrackLoaded,
    unloadTrack
} from './simulator/map/trackMap/trackLoader.js';

// 探头配置
export {
    initSensorArray,
    getSensorConfig,
    setSensorCount,
    setSensorSpacing,
    getLastSensorReadings
} from './simulator/car/sensors/sensorArray.js';

// PID 控制器
export {
    initPID,
    resetPID,
    setPIDParams,
    getPIDConfig,
    getPIDState
} from './simulator/car/control/pidController.js';

// 主循环 Hook
export {
    enableLineFollowerHook,
    disableLineFollowerHook,
    isLineFollowerHookEnabled
} from './simulator/loop/animate.js';

// 调试可视化
export {
    initSensorVisualizer,
    enableSensorVisualizer,
    disableSensorVisualizer,
    toggleSensorVisualizer,
    isSensorVisualizerEnabled,
    disposeSensorVisualizer,
    refreshTrackLine
} from './simulator/debug/sensorVisualizer.js';

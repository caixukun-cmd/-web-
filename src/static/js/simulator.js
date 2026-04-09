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

import * as runtime from './simulator/runtime.js';
import { sendMessage as sendSocketMessage, connectWebSocket, isWebSocketConnected } from './simulator/net/wsClient.js';

// 场景
export { initScene } from './simulator/scene/initScene.js';
export { dispose } from './simulator/scene/dispose.js';

// WebSocket
export { connectWebSocket, isWebSocketConnected } from './simulator/net/wsClient.js';

// 相机
export { setCameraMode } from './simulator/camera/modes.js';
export { resetFreeCamera } from './simulator/camera/reset.js';

// 路径
export { clearPath, startPathRecording, stopPathRecording } from './simulator/path/recorder.js';

// 性能
export { requestRender, getFPS } from './simulator/loop/perf.js';

// 小车状态
export { getCarState } from './simulator/car/state.js';

// ===== 视觉帧采集配置 =====

// 默认每 250ms 采集一次，符合“200~300ms”要求。
const VISION_CAPTURE_INTERVAL = 250;

// JPEG 压缩质量，兼顾清晰度与传输体积。
const VISION_CAPTURE_QUALITY = 0.85;

// 当前是否启用视觉帧采集。
let visionFrameCaptureEnabled = false;

// 定时器句柄，用于开启/关闭时控制循环。
let visionFrameCaptureTimer = null;

// 上一次日志输出时间，避免日志刷屏过于频繁。
let lastVisionCaptureLogTime = 0;

/**
 * 对外保持原有 sendMessage 导出，避免破坏现有调用方式。
 */
export function sendMessage(message) {
    return sendSocketMessage(message);
}

/**
 * 单次采集并发送当前 Three.js 画面。
 * 
 * 流程：
 * 1. 检查 renderer、canvas、WebSocket 是否就绪
 * 2. 将 canvas 编码为 JPEG base64
 * 3. 通过已有 WebSocket 发送给后端 vision_frame 协议
 */
function captureAndSendVisionFrame() {
    // 未启用时直接跳过，防止关闭后残留定时调用。
    if (!visionFrameCaptureEnabled) {
        return;
    }

    // 必须先有渲染器和 canvas。
    if (!runtime.renderer || !runtime.renderer.domElement) {
        return;
    }

    // WebSocket 未连接时不发送，避免报错和无意义开销。
    if (!runtime.socket || runtime.socket.readyState !== WebSocket.OPEN || !runtime.isConnected) {
        return;
    }

    const canvas = runtime.renderer.domElement;

    try {
        // 将当前 WebGL 画面压缩成 JPEG base64。
        const frameBase64 = canvas.toDataURL('image/jpeg', VISION_CAPTURE_QUALITY);

        if (!frameBase64 || !frameBase64.startsWith('data:image/jpeg;base64,')) {
            console.warn('[VisionCapture] 当前帧编码失败，跳过本次发送');
            return;
        }

        const success = sendSocketMessage({
            type: 'vision_frame',
            frame: frameBase64,
            timestamp: Date.now(),
        });

        // 只在一定间隔内打印一次日志，避免控制台过度刷屏。
        if (success) {
            const now = performance.now();
            if (now - lastVisionCaptureLogTime > 3000) {
                console.log('[VisionCapture] 已发送视觉帧到后端');
                lastVisionCaptureLogTime = now;
            }
        }
    } catch (error) {
        console.error('[VisionCapture] 采集或发送视觉帧失败:', error);
    }
}

/**
 * 开启视觉帧采集。
 * 
 * 特点：
 * - 使用定时器而不是每帧都采集，避免对渲染性能造成明显冲击
 * - 重复开启时不会创建多个定时器
 */
export function enableVisionFrameCapture() {
    if (visionFrameCaptureEnabled) {
        console.log('[VisionCapture] 视觉帧采集已处于开启状态');
        return true;
    }

    if (!runtime.renderer || !runtime.renderer.domElement) {
        console.warn('[VisionCapture] 渲染器尚未初始化，无法开启视觉帧采集');
        return false;
    }

    visionFrameCaptureEnabled = true;

    // 立即先采一次，减少用户点击后的等待感。
    captureAndSendVisionFrame();

    visionFrameCaptureTimer = window.setInterval(() => {
        captureAndSendVisionFrame();
    }, VISION_CAPTURE_INTERVAL);

    console.log(`[VisionCapture] 已开启视觉帧采集，间隔 ${VISION_CAPTURE_INTERVAL}ms`);
    return true;
}

/**
 * 关闭视觉帧采集。
 */
export function disableVisionFrameCapture() {
    visionFrameCaptureEnabled = false;

    if (visionFrameCaptureTimer !== null) {
        window.clearInterval(visionFrameCaptureTimer);
        visionFrameCaptureTimer = null;
    }

    console.log('[VisionCapture] 已关闭视觉帧采集');
    return true;
}

/**
 * 提供给外部查询当前视觉帧采集状态。
 */
export function isVisionFrameCaptureEnabled() {
    return visionFrameCaptureEnabled;
}

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

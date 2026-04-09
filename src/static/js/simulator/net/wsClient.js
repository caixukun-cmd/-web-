/**
 * simulator/net/wsClient.js
 * WebSocket 连接与消息处理
 */

import * as runtime from '../runtime.js';
import { updateCarPosition } from '../car/sync.js';
import { setCarStatus } from '../car/state.js';
import { forceSync } from '../car/smoothing.js';

let lineFollowerModule = null;
let trackLoaderModule = null;
let sensorVisualizerModule = null;
let animateModule = null;
let lastUIUpdateTime = 0;

async function loadLineFollowerModules() {
    if (!lineFollowerModule) lineFollowerModule = await import('../car/control/lineFollower.js');
    if (!trackLoaderModule) trackLoaderModule = await import('../map/trackMap/trackLoader.js');
    if (!sensorVisualizerModule) sensorVisualizerModule = await import('../debug/sensorVisualizer.js');
    if (!animateModule) animateModule = await import('../loop/animate.js');
}

export function connectWebSocket(url, callbacks = {}) {
    console.log(`正在连接 WebSocket: ${url}`);

    if (runtime.socket && runtime.socket.readyState === WebSocket.OPEN) {
        runtime.socket.close();
    }

    const newSocket = new WebSocket(url);
    runtime.setSocket(newSocket);

    newSocket.onopen = () => {
        runtime.setIsConnected(true);
        console.log('✓ WebSocket 连接成功');
        if (callbacks.onOpen) callbacks.onOpen();
    };

    newSocket.onmessage = (event) => {
        try {
            handleWebSocketMessage(JSON.parse(event.data), callbacks);
        } catch (error) {
            console.error('解析 WebSocket 消息失败:', error);
        }
    };

    newSocket.onerror = (error) => {
        console.error('WebSocket 错误:', error);
        if (callbacks.onError) callbacks.onError(error);
    };

    newSocket.onclose = () => {
        runtime.setIsConnected(false);
        console.log('WebSocket 连接已关闭');
        if (callbacks.onClose) callbacks.onClose();
    };

    return newSocket;
}

function handleWebSocketMessage(data, callbacks) {
    const { type } = data;

    switch (type) {
        case 'position': {
            updateCarPosition(data.x, data.y, data.rotation);
            const now = performance.now();
            if (now - lastUIUpdateTime >= runtime.UI_UPDATE_INTERVAL) {
                if (data.x !== undefined && data.y !== undefined) {
                    const posXEl = document.getElementById('posX');
                    const posYEl = document.getElementById('posY');
                    if (posXEl) posXEl.textContent = data.x.toFixed(2);
                    if (posYEl) posYEl.textContent = data.y.toFixed(2);
                }
                lastUIUpdateTime = now;
            }
            break;
        }

        case 'status': {
            setCarStatus(data.speed, data.isMoving);
            const speedEl = document.getElementById('speed');
            if (speedEl) speedEl.textContent = data.speed.toFixed(2);
            if (data.speed === 0 && !data.isMoving) forceSync();
            break;
        }

        case 'log':
            if (callbacks.onLog) callbacks.onLog(data.message, data.level);
            break;
        case 'error':
            if (callbacks.onError) callbacks.onError(data.message);
            break;
        case 'complete':
            if (callbacks.onComplete) callbacks.onComplete(data.message);
            break;

        case 'track_load_demo':
            handleTrackLoadDemo(callbacks);
            break;
        case 'track_load_url':
            handleTrackLoadURL(data, callbacks);
            break;
        case 'track_load_data':
            handleTrackLoadData(data, callbacks);
            break;
        case 'line_init':
            handleLineInit(callbacks);
            break;
        case 'line_enable':
            handleLineEnable(callbacks);
            break;
        case 'line_disable':
            handleLineDisable(callbacks);
            break;
        case 'track_clear':
            handleTrackClear(callbacks);
            break;
        case 'line_set_pid':
            handleLineSetPID(data, callbacks);
            break;
        case 'line_set_scale':
            handleLineSetScale(data, callbacks);
            break;

        case 'vision_frame_ack':
            handleVisionFrameAck(data, callbacks);
            break;
        case 'vision_detect_result':
            handleVisionDetectResult(data, callbacks);
            break;
        case 'vision_status_result':
            handleVisionStatusResult(data, callbacks);
            break;
        case 'vision_projection_ack':
            handleVisionProjectionAck(data, callbacks);
            break;

        case 'maps_list':
            if (callbacks.onMapsList) callbacks.onMapsList(data.maps || []);
            break;
        case 'track_data':
            handleTrackData(data, callbacks);
            break;
        default:
            console.log('未知消息类型:', type, data);
    }
}

async function handleTrackLoadDemo(callbacks) {
    try {
        await loadLineFollowerModules();
        if (trackLoaderModule.isTrackLoaded()) {
            if (callbacks.onLog) callbacks.onLog('轨道已存在，使用已选地图', 'info');
            return;
        }
        await trackLoaderModule.loadDemoTrack();
        if (sensorVisualizerModule) sensorVisualizerModule.refreshTrackLine();
        if (callbacks.onLog) callbacks.onLog('演示轨道已加载', 'success');
    } catch (error) {
        if (callbacks.onError) callbacks.onError('加载演示轨道失败: ' + error.message);
    }
}

async function handleTrackLoadURL(data, callbacks) {
    try {
        await loadLineFollowerModules();
        if (!data.url) throw new Error('缺少轨道 URL');
        await trackLoaderModule.loadTrackFromURL(data.url);
        if (sensorVisualizerModule) sensorVisualizerModule.refreshTrackLine();
        if (callbacks.onLog) callbacks.onLog('轨道已加载: ' + data.url, 'success');
    } catch (error) {
        if (callbacks.onError) callbacks.onError('加载轨道失败: ' + error.message);
    }
}

async function handleTrackLoadData(data, callbacks) {
    try {
        await loadLineFollowerModules();
        if (!data.track_data) throw new Error('缺少轨道数据');
        trackLoaderModule.loadTrackData(data.track_data);
        if (sensorVisualizerModule) sensorVisualizerModule.refreshTrackLine();
        if (callbacks.onLog) callbacks.onLog('轨道数据已加载', 'success');
    } catch (error) {
        if (callbacks.onError) callbacks.onError('加载轨道数据失败: ' + error.message);
    }
}

async function handleLineInit(callbacks) {
    try {
        await loadLineFollowerModules();
        lineFollowerModule.initLineFollower();
        sensorVisualizerModule.initSensorVisualizer();
        if (callbacks.onLog) callbacks.onLog('循线系统已初始化', 'success');
    } catch (error) {
        if (callbacks.onError) callbacks.onError('初始化循线系统失败: ' + error.message);
    }
}

async function handleLineEnable(callbacks) {
    try {
        await loadLineFollowerModules();
        lineFollowerModule.enableLineFollower();
        await animateModule.enableLineFollowerHook();
        sensorVisualizerModule.enableSensorVisualizer();
        if (callbacks.onLog) callbacks.onLog('循线功能已启用', 'success');
    } catch (error) {
        if (callbacks.onError) callbacks.onError('启用循线失败: ' + error.message);
    }
}

async function handleLineDisable(callbacks) {
    try {
        await loadLineFollowerModules();
        lineFollowerModule.disableLineFollower();
        animateModule.disableLineFollowerHook();
        sensorVisualizerModule.disableSensorVisualizer();
        if (callbacks.onLog) callbacks.onLog('循线功能已禁用', 'info');
    } catch (error) {
        console.error('禁用循线失败:', error);
    }
}

async function handleTrackClear(callbacks) {
    try {
        await loadLineFollowerModules();
        trackLoaderModule.unloadTrack();
        if (sensorVisualizerModule) sensorVisualizerModule.refreshTrackLine();
        if (callbacks.onLog) callbacks.onLog('轨道已清除', 'info');
    } catch (error) {
        console.error('清除轨道失败:', error);
    }
}

async function handleLineSetPID(data, callbacks) {
    try {
        await loadLineFollowerModules();
        lineFollowerModule.setLineFollowerPID(data.kp, data.ki, data.kd);
        if (callbacks.onLog) callbacks.onLog(`PID 参数已设置: Kp=${data.kp}, Ki=${data.ki}, Kd=${data.kd}`, 'info');
    } catch (error) {
        if (callbacks.onError) callbacks.onError('设置 PID 参数失败: ' + error.message);
    }
}

async function handleLineSetScale(data, callbacks) {
    try {
        await loadLineFollowerModules();
        lineFollowerModule.setSteeringScale(data.scale);
        if (callbacks.onLog) callbacks.onLog(`转向缩放已设置: ${data.scale}`, 'info');
    } catch (error) {
        if (callbacks.onError) callbacks.onError('设置转向缩放失败: ' + error.message);
    }
}

function handleVisionFrameAck(data, callbacks) {
    if (callbacks.onVisionFrameAck) callbacks.onVisionFrameAck(data);
}

function handleVisionDetectResult(data, callbacks) {
    const result = data.result || {};
    const detections = Array.isArray(result.detections) ? result.detections : [];
    const inferenceMs = result.inferenceMs ?? result.inference_time_ms ?? '-';
    if (callbacks.onVisionDetectResult) callbacks.onVisionDetectResult(result);
    if (callbacks.onLog) callbacks.onLog(`视觉检测完成：识别到 ${detections.length} 个目标，耗时 ${inferenceMs} ms`, 'success');
}

function handleVisionStatusResult(data, callbacks) {
    const status = data.status || {};
    const summary = [
        `已缓存帧: ${status.hasFrame ?? status.has_frame ?? false}`,
        `模型就绪: ${status.modelReady ?? status.model_ready ?? false}`,
        `设备: ${status.device ?? '-'}`
    ].join(' | ');
    if (callbacks.onVisionStatusResult) callbacks.onVisionStatusResult(status);
    if (callbacks.onLog) callbacks.onLog(`视觉状态：${summary}`, 'info');
}

function handleVisionProjectionAck(data, callbacks) {
    const result = data.result || {};
    if (callbacks.onVisionProjectionAck) callbacks.onVisionProjectionAck(result);
    if (callbacks.onVisionProjectionResult) callbacks.onVisionProjectionResult(result);
}

async function handleTrackData(data, callbacks) {
    try {
        await loadLineFollowerModules();
        if (!data.track) throw new Error('缺少轨道数据');
        trackLoaderModule.loadTrackData(data.track);
        if (sensorVisualizerModule) sensorVisualizerModule.refreshTrackLine();
        if (callbacks.onTrackLoaded) callbacks.onTrackLoaded(data.track);
    } catch (error) {
        if (callbacks.onError) callbacks.onError('加载轨道数据失败: ' + error.message);
    }
}

export function sendMessage(message) {
    if (runtime.socket && runtime.socket.readyState === WebSocket.OPEN && runtime.isConnected) {
        runtime.socket.send(JSON.stringify(message));
        return true;
    }
    if (window.updateConnectionStatus) window.updateConnectionStatus(false);
    if (window.addConsoleLog) window.addConsoleLog('WebSocket连接异常，无法发送消息', 'error');
    return false;
}

export function isWebSocketConnected() {
    return runtime.isConnected;
}

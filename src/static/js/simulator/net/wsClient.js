/**
 * simulator/net/wsClient.js
 * WebSocket 连接与消息处理
 */

import * as runtime from '../runtime.js';

// ===== 循线系统模块（延迟加载） =====
let lineFollowerModule = null;
let trackLoaderModule = null;
let sensorArrayModule = null;
let pidControllerModule = null;
let sensorVisualizerModule = null;
let animateModule = null;

// 延迟加载循线系统模块
async function loadLineFollowerModules() {
    if (!lineFollowerModule) {
        lineFollowerModule = await import('../car/control/lineFollower.js');
    }
    if (!trackLoaderModule) {
        trackLoaderModule = await import('../map/trackMap/trackLoader.js');
    }
    if (!sensorArrayModule) {
        sensorArrayModule = await import('../car/sensors/sensorArray.js');
    }
    if (!pidControllerModule) {
        pidControllerModule = await import('../car/control/pidController.js');
    }
    if (!sensorVisualizerModule) {
        sensorVisualizerModule = await import('../debug/sensorVisualizer.js');
    }
    if (!animateModule) {
        animateModule = await import('../loop/animate.js');
    }
}
import { updateCarPosition } from '../car/sync.js';
import { setCarStatus } from '../car/state.js';
import { forceSync } from '../car/smoothing.js';

let lastUIUpdateTime = 0;

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
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data, callbacks);
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
        case 'position':
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

        case 'status':
            setCarStatus(data.speed, data.isMoving);
            const speedEl = document.getElementById('speed');
            if (speedEl) speedEl.textContent = data.speed.toFixed(2);

            if (data.speed === 0 && !data.isMoving) {
                forceSync();
            }
            break;

        case 'log':
            if (callbacks.onLog) callbacks.onLog(data.message, data.level);
            break;

        case 'error':
            if (callbacks.onError) callbacks.onError(data.message);
            break;

        case 'complete':
            if (callbacks.onComplete) callbacks.onComplete(data.message);
            break;

        // ===== 循线系统控制消息 =====
        case 'track_load_demo':
            handleTrackLoadDemo(data, callbacks);
            break;

        case 'track_load_url':
            handleTrackLoadURL(data, callbacks);
            break;

        case 'track_load_data':
            handleTrackLoadData(data, callbacks);
            break;

        case 'line_init':
            handleLineInit(data, callbacks);
            break;

        case 'line_enable':
            handleLineEnable(data, callbacks);
            break;

        case 'line_disable':
            handleLineDisable(data, callbacks);
            break;

        case 'track_clear':
            handleTrackClear(data, callbacks);
            break;

        case 'line_set_pid':
            handleLineSetPID(data, callbacks);
            break;

        case 'line_set_scale':
            handleLineSetScale(data, callbacks);
            break;

        // ===== 地图选择消息 =====
        case 'maps_list':
            handleMapsList(data, callbacks);
            break;

        case 'track_data':
            handleTrackData(data, callbacks);
            break;

        default:
            console.log('未知消息类型:', type, data);
    }
}

// ===== 循线系统消息处理函数 =====

// 加载演示轨道
async function handleTrackLoadDemo(data, callbacks) {
    try {
        await loadLineFollowerModules();
        
        // 如果已经加载了轨道（用户通过下拉框选择），跳过加载默认轨道
        if (trackLoaderModule.isTrackLoaded()) {
            console.log('✓ 轨道已存在，跳过加载默认轨道');
            if (callbacks.onLog) callbacks.onLog('轨道已存在，使用已选地图', 'info');
            return;
        }
        
        await trackLoaderModule.loadDemoTrack();
        
        // 刷新轨道可视化
        if (sensorVisualizerModule) {
            sensorVisualizerModule.refreshTrackLine();
        }
        
        console.log('✓ 演示轨道已加载');
        if (callbacks.onLog) callbacks.onLog('演示轨道已加载', 'success');
    } catch (error) {
        console.error('加载演示轨道失败:', error);
        if (callbacks.onError) callbacks.onError('加载演示轨道失败: ' + error.message);
    }
}

// 从 URL 加载轨道
async function handleTrackLoadURL(data, callbacks) {
    try {
        await loadLineFollowerModules();
        const url = data.url;
        if (!url) {
            throw new Error('缺少轨道 URL');
        }
        await trackLoaderModule.loadTrackFromURL(url);
        
        // 刷新轨道可视化
        if (sensorVisualizerModule) {
            sensorVisualizerModule.refreshTrackLine();
        }
        
        console.log('✓ 轨道已从 URL 加载:', url);
        if (callbacks.onLog) callbacks.onLog('轨道已加载: ' + url, 'success');
    } catch (error) {
        console.error('加载轨道失败:', error);
        if (callbacks.onError) callbacks.onError('加载轨道失败: ' + error.message);
    }
}

// 从数据加载轨道
async function handleTrackLoadData(data, callbacks) {
    try {
        await loadLineFollowerModules();
        const trackData = data.track_data;
        if (!trackData) {
            throw new Error('缺少轨道数据');
        }
        trackLoaderModule.loadTrackData(trackData);
        
        // 刷新轨道可视化
        if (sensorVisualizerModule) {
            sensorVisualizerModule.refreshTrackLine();
        }
        
        console.log('✓ 轨道数据已加载');
        if (callbacks.onLog) callbacks.onLog('轨道数据已加载', 'success');
    } catch (error) {
        console.error('加载轨道数据失败:', error);
        if (callbacks.onError) callbacks.onError('加载轨道数据失败: ' + error.message);
    }
}

// 初始化循线系统
async function handleLineInit(data, callbacks) {
    try {
        await loadLineFollowerModules();
        
        // 初始化各模块
        lineFollowerModule.initLineFollower();
        sensorVisualizerModule.initSensorVisualizer();
        
        console.log('✓ 循线系统已初始化');
        if (callbacks.onLog) callbacks.onLog('循线系统已初始化', 'success');
    } catch (error) {
        console.error('初始化循线系统失败:', error);
        if (callbacks.onError) callbacks.onError('初始化循线系统失败: ' + error.message);
    }
}

// 启用循线
async function handleLineEnable(data, callbacks) {
    try {
        await loadLineFollowerModules();
        
        // 启用循线系统
        lineFollowerModule.enableLineFollower();
        
        // 启用主循环 Hook
        await animateModule.enableLineFollowerHook();
        
        // 启用调试可视化
        sensorVisualizerModule.enableSensorVisualizer();
        
        console.log('✓ 循线功能已启用');
        if (callbacks.onLog) callbacks.onLog('循线功能已启用', 'success');
    } catch (error) {
        console.error('启用循线失败:', error);
        if (callbacks.onError) callbacks.onError('启用循线失败: ' + error.message);
    }
}

// 禁用循线
async function handleLineDisable(data, callbacks) {
    try {
        await loadLineFollowerModules();
        
        // 禁用循线系统
        lineFollowerModule.disableLineFollower();
        
        // 禁用主循环 Hook
        animateModule.disableLineFollowerHook();
        
        // 禁用调试可视化
        sensorVisualizerModule.disableSensorVisualizer();
        
        console.log('✓ 循线功能已禁用');
        if (callbacks.onLog) callbacks.onLog('循线功能已禁用', 'info');
    } catch (error) {
        console.error('禁用循线失败:', error);
        // 静默处理禁用失败（可能模块未加载）
    }
}

// 清除轨道
async function handleTrackClear(data, callbacks) {
    try {
        await loadLineFollowerModules();
        
        // 清除轨道数据
        trackLoaderModule.unloadTrack();
        
        // 刷新轨道可视化（清除显示）
        if (sensorVisualizerModule) {
            sensorVisualizerModule.refreshTrackLine();
        }
        
        console.log('✓ 轨道已清除');
        if (callbacks.onLog) callbacks.onLog('轨道已清除', 'info');
    } catch (error) {
        console.error('清除轨道失败:', error);
        // 静默处理（可能模块未加载）
    }
}

// 设置 PID 参数
async function handleLineSetPID(data, callbacks) {
    try {
        await loadLineFollowerModules();
        
        const { kp, ki, kd } = data;
        lineFollowerModule.setLineFollowerPID(kp, ki, kd);
        
        console.log(`✓ PID 参数已设置: Kp=${kp}, Ki=${ki}, Kd=${kd}`);
        if (callbacks.onLog) callbacks.onLog(`PID 参数已设置: Kp=${kp}, Ki=${ki}, Kd=${kd}`, 'info');
    } catch (error) {
        console.error('设置 PID 参数失败:', error);
        if (callbacks.onError) callbacks.onError('设置 PID 参数失败: ' + error.message);
    }
}

// 设置转向缩放
async function handleLineSetScale(data, callbacks) {
    try {
        await loadLineFollowerModules();
        
        const { scale } = data;
        lineFollowerModule.setSteeringScale(scale);
        
        console.log(`✓ 转向缩放已设置: ${scale}`);
        if (callbacks.onLog) callbacks.onLog(`转向缩放已设置: ${scale}`, 'info');
    } catch (error) {
        console.error('设置转向缩放失败:', error);
        if (callbacks.onError) callbacks.onError('设置转向缩放失败: ' + error.message);
    }
}

// ===== 地图选择消息处理 =====

// 处理地图列表响应
function handleMapsList(data, callbacks) {
    const maps = data.maps || [];
    console.log(`✓ 收到地图列表: ${maps.length} 个地图`);
    
    // 触发回调，让 simulator.html 填充下拉框
    if (callbacks.onMapsList) {
        callbacks.onMapsList(maps);
    }
}

// 处理轨道数据响应
async function handleTrackData(data, callbacks) {
    try {
        await loadLineFollowerModules();
        
        const trackData = data.track;
        if (!trackData) {
            throw new Error('缺少轨道数据');
        }
        
        // 加载到前端轨道系统
        trackLoaderModule.loadTrackData(trackData);
        
        // 刷新轨道可视化
        if (sensorVisualizerModule) {
            sensorVisualizerModule.refreshTrackLine();
        }
        
        console.log(`✓ 轨道数据已加载: ${trackData.name || trackData._mapId}`);
        
        // 触发回调
        if (callbacks.onTrackLoaded) {
            callbacks.onTrackLoaded(trackData);
        }
    } catch (error) {
        console.error('加载轨道数据失败:', error);
        if (callbacks.onError) callbacks.onError('加载轨道数据失败: ' + error.message);
    }
}

export function sendMessage(message) {
    if (runtime.socket && runtime.socket.readyState === WebSocket.OPEN && runtime.isConnected) {
        runtime.socket.send(JSON.stringify(message));
        return true;
    } else {
        console.warn('WebSocket 未连接或连接状态异常:', runtime.socket ? runtime.socket.readyState : 'null');
        if (window.updateConnectionStatus) {
            window.updateConnectionStatus(false);
        }
        if (window.addConsoleLog) {
            window.addConsoleLog('WebSocket连接异常，无法发送消息', 'error');
        }
        return false;
    }
}

export function isWebSocketConnected() {
    return runtime.isConnected;
}

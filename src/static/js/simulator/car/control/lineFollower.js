/**
 * simulator/car/control/lineFollower.js
 * 循线主控制器模块
 * 
 * 功能：
 * - 整合探头阵列、PID 控制器
 * - 每帧更新循线状态
 * - 输出转向控制量
 * - 支持启用/禁用
 */

import { initSensorArray, updateSensorReadings, resetSensorArray, getSensorConfig } from '../sensors/sensorArray.js';
import { initPID, computePID, resetPID, getPIDConfig, setPIDParams } from './pidController.js';
import { loadDemoTrack, isTrackLoaded, unloadTrack } from '../../map/trackMap/trackLoader.js';
import { resetSamplerCache } from '../../map/trackMap/trackSampler.js';
import { carTargetPosition, carCurrentPosition } from '../state.js';

// ===== 循线系统状态 =====
let lineFollowerEnabled = false;
let lineFollowerInitialized = false;

// ===== 循线输出结果 =====
let lastLineFollowerResult = {
    enabled: false,
    steering: 0,
    error: 0,
    lineLost: true,
    sensorReadings: [],
    pidOutput: null
};

// ===== 循线配置 =====
const DEFAULT_LINE_FOLLOWER_CONFIG = {
    steeringScale: 45,    // 转向角度缩放（误差 1.0 对应的转向角度）
    autoLoadDemoTrack: false  // 是否自动加载示例轨道
};

let lineFollowerConfig = { ...DEFAULT_LINE_FOLLOWER_CONFIG };

// ===== 初始化循线系统 =====
export function initLineFollower(config = {}) {
    // 合并配置
    lineFollowerConfig = { ...DEFAULT_LINE_FOLLOWER_CONFIG, ...config };
    
    // 初始化探头阵列
    initSensorArray(config.sensors || {});
    
    // 初始化 PID 控制器
    initPID(config.pid || {});
    
    // 可选：加载示例轨道（异步从后端获取）
    if (lineFollowerConfig.autoLoadDemoTrack) {
        loadDemoTrack().then(success => {
            if (success) {
                console.log('✓ 演示轨道自动加载成功');
            }
        });
    }
    
    lineFollowerInitialized = true;
    lineFollowerEnabled = false; // 默认禁用，需要手动启用
    
    console.log('✓ 循线系统初始化完成');
    return true;
}

// ===== 启用循线系统 =====
export function enableLineFollower() {
    if (!lineFollowerInitialized) {
        console.warn('循线系统未初始化，请先调用 initLineFollower()');
        return false;
    }
    
    if (!isTrackLoaded()) {
        console.warn('轨道未加载，请先加载轨道');
        return false;
    }
    
    lineFollowerEnabled = true;
    resetSensorArray();
    resetPID();
    resetSamplerCache();
    
    console.log('✓ 循线系统已启用');
    return true;
}

// ===== 禁用循线系统 =====
export function disableLineFollower() {
    lineFollowerEnabled = false;
    lastLineFollowerResult = {
        enabled: false,
        steering: 0,
        error: 0,
        lineLost: true,
        sensorReadings: [],
        pidOutput: null
    };
    
    console.log('✓ 循线系统已禁用');
}

// ===== 每帧更新（由主循环调用） =====
export function updateLineFollower() {
    if (!lineFollowerEnabled || !lineFollowerInitialized) {
        return lastLineFollowerResult;
    }
    
    // 1. 更新探头读数
    const sensorResult = updateSensorReadings();
    
    // 2. 计算 PID 输出
    const pidResult = computePID(sensorResult.error);
    
    // 3. 计算转向角度
    const steering = pidResult.output * lineFollowerConfig.steeringScale;
    
    // 4. 应用转向到小车（关键！）
    if (!sensorResult.lineLost) {
        applySteering(steering);
    }
    
    // 5. 更新结果
    lastLineFollowerResult = {
        enabled: true,
        steering,
        error: sensorResult.error,
        lineLost: sensorResult.lineLost,
        linePosition: sensorResult.linePosition,
        sensorReadings: sensorResult.readings,
        worldPositions: sensorResult.worldPositions,
        pidOutput: pidResult
    };
    
    return lastLineFollowerResult;
}

// ===== 应用转向到小车 =====
function applySteering(steeringAngle) {
    // 将循线系统计算的转向角度应用到小车目标旋转
    // steering > 0 表示需要右转，steering < 0 表示需要左转
    // 这里采用增量方式：在当前旋转基础上叠加转向角度
    
    // 获取当前小车朝向
    const currentRotation = carCurrentPosition.rotation;
    
    // 计算新的目标旋转（当前旋转 + 转向修正）
    // 注意：steeringAngle 是每帧的转向量，需要根据帧率调整
    // 这里假设每帧约 16ms (60fps)，转向角度按比例缩放
    const deltaTime = 10 / 60;  // 假设 60fps
    const steeringDelta = steeringAngle * deltaTime;
    
    let newRotation = currentRotation + steeringDelta;
    
    // 归一化到 0-360 范围
    while (newRotation < 0) newRotation += 360;
    while (newRotation >= 360) newRotation -= 360;
    
    // 更新目标旋转
    carTargetPosition.rotation = newRotation;
}

// ===== 获取当前循线结果 =====
export function getLineFollowerResult() {
    return lastLineFollowerResult;
}

// ===== 获取转向控制量 =====
export function getSteering() {
    return lastLineFollowerResult.steering;
}

// ===== 检查是否启用 =====
export function isLineFollowerEnabled() {
    return lineFollowerEnabled;
}

// ===== 检查是否初始化 =====
export function isLineFollowerInitialized() {
    return lineFollowerInitialized;
}

// ===== 重置循线系统 =====
export function resetLineFollower() {
    resetSensorArray();
    resetPID();
    resetSamplerCache();
    
    lastLineFollowerResult = {
        enabled: lineFollowerEnabled,
        steering: 0,
        error: 0,
        lineLost: true,
        sensorReadings: [],
        pidOutput: null
    };
    
    console.log('✓ 循线系统已重置');
}

// ===== 设置 PID 参数 =====
export function setLineFollowerPID(Kp, Ki, Kd) {
    setPIDParams(Kp, Ki, Kd);
}

// ===== 设置转向缩放 =====
export function setSteeringScale(scale) {
    lineFollowerConfig.steeringScale = Math.max(1, Math.min(180, scale));
}

// ===== 获取循线配置 =====
export function getLineFollowerConfig() {
    return {
        ...lineFollowerConfig,
        sensors: getSensorConfig(),
        pid: getPIDConfig()
    };
}

// ===== 销毁循线系统 =====
export function disposeLineFollower() {
    disableLineFollower();
    unloadTrack();
    lineFollowerInitialized = false;
    console.log('✓ 循线系统已销毁');
}

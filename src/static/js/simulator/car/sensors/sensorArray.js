/**
 * simulator/car/sensors/sensorArray.js
 * 多探头系统模块
 * 
 * 功能：
 * - 管理多个探头的配置
 * - 计算探头世界坐标
 * - 输出探头阵列检测值
 * - 计算循线误差
 */

import { localToWorld, sensorDetect } from './sensorRaycast.js';
import { carCurrentPosition } from '../state.js';
import * as runtime from '../../runtime.js';

// ===== 探头配置 =====
const DEFAULT_SENSOR_CONFIG = {
    count: 3,                    // 探头数量
    spacing: 0.15,               // 探头间距（世界单位）
    forwardOffset: 0.8,          // 前向偏移（相对于小车中心）
    heightOffset: 0.02           // 离地高度（用于可视化）
};

let sensorConfig = { ...DEFAULT_SENSOR_CONFIG };
let sensorPositions = [];        // 探头本地位置数组
let lastSensorReadings = [];     // 上次读数（用于丢线检测）
let lastValidError = 0;          // 上次有效误差（丢线时使用）

// ===== 初始化探头阵列 =====
export function initSensorArray(config = {}) {
    sensorConfig = { ...DEFAULT_SENSOR_CONFIG, ...config };
    sensorPositions = generateSensorPositions();
    lastSensorReadings = new Array(sensorConfig.count).fill(0);
    lastValidError = 0;
    
    console.log(`✓ 探头阵列初始化完成: ${sensorConfig.count} 探头, 间距 ${sensorConfig.spacing}`);
    return sensorPositions;
}

// ===== 生成探头本地位置 =====
function generateSensorPositions() {
    const positions = [];
    const count = sensorConfig.count;
    const spacing = sensorConfig.spacing;
    const forwardOffset = sensorConfig.forwardOffset;
    
    // 计算起始 X 位置（居中排列）
    const totalWidth = (count - 1) * spacing;
    const startX = -totalWidth / 2;
    
    for (let i = 0; i < count; i++) {
        positions.push({
            index: i,
            localX: startX + i * spacing,  // 左右位置
            localZ: forwardOffset           // 前向偏移
        });
    }
    
    return positions;
}

// ===== 更新探头读数 =====
export function updateSensorReadings() {
    if (!runtime.carModel || sensorPositions.length === 0) {
        return { readings: lastSensorReadings, error: lastValidError, lineLost: true };
    }
    
    const carX = carCurrentPosition.x;
    const carZ = carCurrentPosition.y; // 注意：y 在状态中对应 z 轴
    const carRotation = carCurrentPosition.rotation;
    
    const readings = [];
    const worldPositions = [];
    
    // 检测每个探头
    for (const sensor of sensorPositions) {
        const worldPos = localToWorld(sensor.localX, sensor.localZ, carX, carZ, carRotation);
        const hit = sensorDetect(worldPos.x, worldPos.z);
        
        readings.push(hit);
        worldPositions.push({
            ...sensor,
            worldX: worldPos.x,
            worldZ: worldPos.z,
            hit
        });
    }
    
    // 计算误差
    const errorResult = calculateLineError(readings);
    
    // 更新缓存
    lastSensorReadings = readings;
    if (!errorResult.lineLost) {
        lastValidError = errorResult.error;
    }
    
    return {
        readings,
        worldPositions,
        error: errorResult.error,
        lineLost: errorResult.lineLost,
        linePosition: errorResult.linePosition
    };
}

// ===== 计算循线误差 =====
function calculateLineError(readings) {
    const count = readings.length;
    
    if (count === 0) {
        return { error: 0, lineLost: true, linePosition: 'unknown' };
    }
    
    // 统计命中的探头
    const hitIndices = [];
    for (let i = 0; i < count; i++) {
        if (readings[i] === 1) {
            hitIndices.push(i);
        }
    }
    
    // 判断丢线
    if (hitIndices.length === 0) {
        // 完全丢线，使用上次有效误差的方向继续转向
        return { 
            error: lastValidError > 0 ? 1.0 : (lastValidError < 0 ? -1.0 : 0),
            lineLost: true,
            linePosition: lastValidError > 0 ? 'right' : 'left'
        };
    }
    
    // 计算加权平均位置
    // 探头索引范围: 0 到 count-1
    // 归一化到 [-1, 1] 范围，中心探头对应 0
    const centerIndex = (count - 1) / 2;
    
    let weightedSum = 0;
    let totalWeight = 0;
    
    for (const idx of hitIndices) {
        const normalizedPos = (idx - centerIndex) / centerIndex; // [-1, 1]
        weightedSum += normalizedPos;
        totalWeight += 1;
    }
    
    const error = weightedSum / totalWeight;
    
    // 判断线的位置
    let linePosition = 'center';
    if (error < -0.1) linePosition = 'left';
    else if (error > 0.1) linePosition = 'right';
    
    return {
        error,           // 范围 [-1, 1]，负=线在左侧，正=线在右侧
        lineLost: false,
        linePosition
    };
}

// ===== 获取探头配置 =====
export function getSensorConfig() {
    return { ...sensorConfig };
}

// ===== 获取探头位置 =====
export function getSensorPositions() {
    return sensorPositions;
}

// ===== 获取上次读数 =====
export function getLastSensorReadings() {
    return lastSensorReadings;
}

// ===== 设置探头数量 =====
export function setSensorCount(count) {
    sensorConfig.count = Math.max(1, Math.min(9, count)); // 限制 1-9 个
    sensorPositions = generateSensorPositions();
    lastSensorReadings = new Array(sensorConfig.count).fill(0);
}

// ===== 设置探头间距 =====
export function setSensorSpacing(spacing) {
    sensorConfig.spacing = Math.max(0.05, Math.min(0.5, spacing)); // 限制 0.05-0.5
    sensorPositions = generateSensorPositions();
}

// ===== 设置前向偏移 =====
export function setSensorForwardOffset(offset) {
    sensorConfig.forwardOffset = Math.max(0.1, Math.min(2.0, offset)); // 限制 0.1-2.0
    sensorPositions = generateSensorPositions();
}

// ===== 重置探头状态 =====
export function resetSensorArray() {
    lastSensorReadings = new Array(sensorConfig.count).fill(0);
    lastValidError = 0;
}

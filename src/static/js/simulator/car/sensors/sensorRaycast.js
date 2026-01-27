/**
 * simulator/car/sensors/sensorRaycast.js
 * 探头逻辑检测模块（基于轨道采样，不依赖颜色/纹理）
 * 
 * 功能：
 * - 单个探头的轨道检测
 * - 将探头本地位置转换为世界坐标
 * - 返回 0/1 检测结果
 */

import { sampleTrackAtPoint, getSignedDistanceToTrack } from '../../map/trackMap/trackSampler.js';

// ===== 单探头检测 =====
export function sensorDetect(worldX, worldZ) {
    return sampleTrackAtPoint(worldX, worldZ);
}

// ===== 将探头本地位置转换为世界坐标 =====
export function localToWorld(localX, localZ, carX, carZ, carRotationDeg) {
    // 将角度转为弧度
    const radians = carRotationDeg * Math.PI / 180;
    
    // 旋转变换（小车坐标系 -> 世界坐标系）
    // 注意：小车前进方向对应 +Z 轴
    const cosR = Math.cos(radians);
    const sinR = Math.sin(radians);
    
    // 本地坐标系：X 为左右，Z 为前后
    const worldX = carX + localX * cosR - localZ * sinR;
    const worldZ = carZ + localX * sinR + localZ * cosR;
    
    return { x: worldX, z: worldZ };
}

// ===== 探头检测结果（包含详细信息） =====
export function sensorDetectWithInfo(worldX, worldZ, carRotationDeg) {
    const result = getSignedDistanceToTrack(worldX, worldZ, carRotationDeg);
    
    return {
        hit: result.onTrack ? 1 : 0,
        distance: result.distance,
        signedDistance: result.signed,
        nearestPoint: result.nearestPoint
    };
}

// ===== 批量探头检测 =====
export function batchSensorDetect(sensorPositions, carX, carZ, carRotationDeg) {
    const results = [];
    
    for (const sensor of sensorPositions) {
        const worldPos = localToWorld(sensor.localX, sensor.localZ, carX, carZ, carRotationDeg);
        const hit = sensorDetect(worldPos.x, worldPos.z);
        
        results.push({
            localX: sensor.localX,
            localZ: sensor.localZ,
            worldX: worldPos.x,
            worldZ: worldPos.z,
            hit
        });
    }
    
    return results;
}

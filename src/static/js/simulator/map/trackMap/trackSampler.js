/**
 * simulator/map/trackMap/trackSampler.js
 * 轨道命中检测模块（逻辑层，不依赖颜色）
 * 
 * 功能：
 * - 输入世界坐标 (x, z)
 * - 判断是否命中轨道
 * - 返回 0 (未命中) / 1 (命中)
 */

import { getTrackWaypoints, getTrackWidth, isTrackLoaded } from './trackLoader.js';

// ===== 缓存最近查询的路径点索引（优化性能） =====
let lastNearestIndex = 0;

// ===== 检测点是否在轨道上 =====
export function sampleTrackAtPoint(x, z) {
    if (!isTrackLoaded()) {
        return 0; // 轨道未加载，返回未命中
    }
    
    const waypoints = getTrackWaypoints();
    const halfWidth = getTrackWidth() / 2;
    
    // 查找最近的轨道线段
    const result = findNearestSegmentDistance(x, z, waypoints);
    
    if (result.distance <= halfWidth) {
        return 1; // 命中轨道
    }
    
    return 0; // 未命中
}

// ===== 获取点到轨道的距离（用于误差计算） =====
export function getDistanceToTrack(x, z) {
    if (!isTrackLoaded()) {
        return Infinity;
    }
    
    const waypoints = getTrackWaypoints();
    const result = findNearestSegmentDistance(x, z, waypoints);
    
    return result.distance;
}

// ===== 获取点到轨道的带符号距离（正=右侧，负=左侧） =====
export function getSignedDistanceToTrack(x, z, headingAngle) {
    if (!isTrackLoaded()) {
        return { distance: Infinity, signed: 0, onTrack: false };
    }
    
    const waypoints = getTrackWaypoints();
    const halfWidth = getTrackWidth() / 2;
    const result = findNearestSegmentDistance(x, z, waypoints);
    
    // 计算带符号距离（用于判断左右偏移）
    const signedDistance = calculateSignedDistance(
        x, z, 
        result.nearestPoint.x, result.nearestPoint.z,
        result.segmentDir.x, result.segmentDir.z,
        headingAngle
    );
    
    return {
        distance: result.distance,
        signed: signedDistance,
        onTrack: result.distance <= halfWidth,
        nearestPoint: result.nearestPoint,
        segmentIndex: result.segmentIndex
    };
}

// ===== 查找最近的轨道线段及距离 =====
function findNearestSegmentDistance(x, z, waypoints) {
    if (waypoints.length < 2) {
        return { 
            distance: Infinity, 
            nearestPoint: { x: 0, z: 0 },
            segmentDir: { x: 0, z: 1 },
            segmentIndex: 0
        };
    }
    
    let minDist = Infinity;
    let nearestPoint = { x: 0, z: 0 };
    let segmentDir = { x: 0, z: 1 };
    let segmentIndex = 0;
    
    // 从上次最近索引附近开始搜索（局部性优化）
    const searchRadius = Math.min(50, waypoints.length);
    const startIdx = Math.max(0, lastNearestIndex - searchRadius);
    const endIdx = Math.min(waypoints.length - 1, lastNearestIndex + searchRadius);
    
    // 局部搜索
    for (let i = startIdx; i < endIdx; i++) {
        const result = pointToSegmentDistance(
            x, z,
            waypoints[i].x, waypoints[i].z,
            waypoints[i + 1].x, waypoints[i + 1].z
        );
        
        if (result.distance < minDist) {
            minDist = result.distance;
            nearestPoint = result.closestPoint;
            segmentDir = result.direction;
            segmentIndex = i;
        }
    }
    
    // 如果局部搜索结果不够好，进行全局搜索
    if (minDist > getTrackWidth() * 2) {
        for (let i = 0; i < waypoints.length - 1; i++) {
            if (i >= startIdx && i < endIdx) continue; // 跳过已搜索的
            
            const result = pointToSegmentDistance(
                x, z,
                waypoints[i].x, waypoints[i].z,
                waypoints[i + 1].x, waypoints[i + 1].z
            );
            
            if (result.distance < minDist) {
                minDist = result.distance;
                nearestPoint = result.closestPoint;
                segmentDir = result.direction;
                segmentIndex = i;
            }
        }
    }
    
    // 更新缓存
    lastNearestIndex = segmentIndex;
    
    return { 
        distance: minDist, 
        nearestPoint,
        segmentDir,
        segmentIndex
    };
}

// ===== 计算点到线段的距离 =====
function pointToSegmentDistance(px, pz, ax, az, bx, bz) {
    const abx = bx - ax;
    const abz = bz - az;
    const apx = px - ax;
    const apz = pz - az;
    
    const abLenSq = abx * abx + abz * abz;
    
    if (abLenSq === 0) {
        // 线段退化为点
        const dist = Math.sqrt(apx * apx + apz * apz);
        return {
            distance: dist,
            closestPoint: { x: ax, z: az },
            direction: { x: 0, z: 1 },
            t: 0
        };
    }
    
    // 计算投影参数 t
    let t = (apx * abx + apz * abz) / abLenSq;
    t = Math.max(0, Math.min(1, t)); // 限制在 [0, 1] 范围
    
    // 计算最近点
    const closestX = ax + t * abx;
    const closestZ = az + t * abz;
    
    // 计算距离
    const dx = px - closestX;
    const dz = pz - closestZ;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    // 计算线段方向（归一化）
    const abLen = Math.sqrt(abLenSq);
    const direction = { x: abx / abLen, z: abz / abLen };
    
    return {
        distance,
        closestPoint: { x: closestX, z: closestZ },
        direction,
        t
    };
}

// ===== 计算带符号距离（正=右侧，负=左侧） =====
function calculateSignedDistance(px, pz, nearestX, nearestZ, dirX, dirZ, headingAngle) {
    // 从最近点到采样点的向量
    const toPointX = px - nearestX;
    const toPointZ = pz - nearestZ;
    
    // 计算叉积来判断左右
    // 轨道方向的右向量 = (dirZ, -dirX)
    const cross = dirX * toPointZ - dirZ * toPointX;
    
    // 距离
    const dist = Math.sqrt(toPointX * toPointX + toPointZ * toPointZ);
    
    // 返回带符号距离（叉积为正表示点在轨道右侧）
    return cross >= 0 ? dist : -dist;
}

// ===== 重置缓存（轨道切换时调用） =====
export function resetSamplerCache() {
    lastNearestIndex = 0;
}

// ===== 批量采样（用于多探头） =====
export function sampleTrackAtPoints(points) {
    return points.map(p => sampleTrackAtPoint(p.x, p.z));
}

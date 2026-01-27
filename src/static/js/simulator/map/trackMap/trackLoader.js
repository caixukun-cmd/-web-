/**
 * simulator/map/trackMap/trackLoader.js
 * JSON 轨道地图加载模块
 * 
 * 轨道 JSON 格式示例:
 * {
 *   "name": "基础循线轨道",
 *   "version": "1.0",
 *   "trackWidth": 0.5,          // 轨道宽度（世界单位）
 *   "segments": [
 *     {
 *       "type": "line",          // 线段类型: line | arc
 *       "start": [0, 0],         // 起点 [x, z]
 *       "end": [10, 0]           // 终点 [x, z]（line 类型）
 *     },
 *     {
 *       "type": "arc",
 *       "center": [10, 5],       // 圆心 [x, z]
 *       "radius": 5,             // 半径
 *       "startAngle": -90,       // 起始角度（度）
 *       "endAngle": 0            // 结束角度（度）
 *     }
 *   ],
 *   "waypoints": [               // 可选：路径点（用于采样）
 *     [0, 0], [1, 0], [2, 0], ...
 *   ]
 * }
 */

// ===== 当前加载的轨道数据 =====
let currentTrack = null;
let trackWaypoints = [];       // 采样后的路径点数组 [{x, z}, ...]
let trackWidth = 0.5;          // 默认轨道宽度

// ===== 加载轨道 JSON =====
export async function loadTrackFromURL(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const trackData = await response.json();
        return loadTrackData(trackData);
    } catch (error) {
        console.error('加载轨道 JSON 失败:', error);
        return false;
    }
}

// ===== 直接加载轨道数据对象 =====
export function loadTrackData(trackData) {
    try {
        currentTrack = trackData;
        trackWidth = trackData.trackWidth || 0.5;
        
        // 如果有预定义的 waypoints，直接使用
        if (trackData.waypoints && trackData.waypoints.length > 0) {
            trackWaypoints = trackData.waypoints.map(p => ({ x: p[0], z: p[1] }));
        } else if (trackData.segments && trackData.segments.length > 0) {
            // 否则从 segments 生成 waypoints
            trackWaypoints = generateWaypointsFromSegments(trackData.segments);
        } else {
            console.warn('轨道数据中没有有效的路径定义');
            return false;
        }
        
        console.log(`✓ 轨道加载成功: ${trackData.name || '未命名'}, 路径点: ${trackWaypoints.length}, 宽度: ${trackWidth}`);
        return true;
    } catch (error) {
        console.error('解析轨道数据失败:', error);
        return false;
    }
}

// ===== 从 segments 生成路径点 =====
function generateWaypointsFromSegments(segments, sampleInterval = 0.2) {
    const waypoints = [];
    
    for (const segment of segments) {
        if (segment.type === 'line') {
            // 直线段采样
            const start = { x: segment.start[0], z: segment.start[1] };
            const end = { x: segment.end[0], z: segment.end[1] };
            const length = Math.sqrt(
                Math.pow(end.x - start.x, 2) + Math.pow(end.z - start.z, 2)
            );
            const numSamples = Math.max(2, Math.ceil(length / sampleInterval));
            
            for (let i = 0; i < numSamples; i++) {
                const t = i / (numSamples - 1);
                waypoints.push({
                    x: start.x + (end.x - start.x) * t,
                    z: start.z + (end.z - start.z) * t
                });
            }
        } else if (segment.type === 'arc') {
            // 圆弧段采样
            const center = { x: segment.center[0], z: segment.center[1] };
            const radius = segment.radius;
            const startAngle = segment.startAngle * Math.PI / 180;
            const endAngle = segment.endAngle * Math.PI / 180;

            // 计算弧长（支持顺时针）
            let angleDiff = endAngle - startAngle;

            const clockwise = !!segment.clockwise; // 新增：顺时针标志
            if (clockwise) {
                // 顺时针：让 angleDiff 为负（走顺时针短弧）
                if (angleDiff > 0) angleDiff -= 2 * Math.PI;
            } else {
                // 逆时针（默认）：让 angleDiff 为正（走逆时针短弧）
                if (angleDiff < 0) angleDiff += 2 * Math.PI;
            }

            const arcLength = radius * Math.abs(angleDiff);
            const numSamples = Math.max(2, Math.ceil(arcLength / sampleInterval));
            
            for (let i = 0; i < numSamples; i++) {
                const t = i / (numSamples - 1);
                const angle = startAngle + angleDiff * t;
                waypoints.push({
                    x: center.x + radius * Math.cos(angle),
                    z: center.z + radius * Math.sin(angle)
                });
            }
        }
    }    
    // 去重（相邻点距离过近的）
    return deduplicateWaypoints(waypoints, sampleInterval * 0.5);
}

// ===== 去重路径点 =====
function deduplicateWaypoints(waypoints, minDistance) {
    if (waypoints.length < 2) return waypoints;
    
    const result = [waypoints[0]];
    for (let i = 1; i < waypoints.length; i++) {
        const last = result[result.length - 1];
        const curr = waypoints[i];
        const dist = Math.sqrt(
            Math.pow(curr.x - last.x, 2) + Math.pow(curr.z - last.z, 2)
        );
        if (dist >= minDistance) {
            result.push(curr);
        }
    }
    return result;
}

// ===== 获取轨道路径点 =====
export function getTrackWaypoints() {
    return trackWaypoints;
}

// ===== 获取轨道宽度 =====
export function getTrackWidth() {
    return trackWidth;
}

// ===== 获取当前轨道数据 =====
export function getCurrentTrack() {
    return currentTrack;
}

// ===== 检查轨道是否已加载 =====
export function isTrackLoaded() {
    return trackWaypoints.length > 0;
}

// ===== 卸载轨道 =====
export function unloadTrack() {
    currentTrack = null;
    trackWaypoints = [];
    trackWidth = 0.5;
    console.log('✓ 轨道已卸载');
}

// ===== 创建示例轨道（用于测试） =====
export function loadDemoTrack() {
    const demoTrack = {
        name: "示例循线轨道（平滑版）",
        version: "1.1",
        trackWidth: 0.3,
        segments: [
            { type: "line", start: [2, 12], end: [18, 12] },
            // 右上：点(18,12)是 +z => 90°，点(20,10)是 +x => 0°（顺时针 90°）
            { type: "arc", center: [18, 10], radius: 2, startAngle: 90, endAngle: 0, clockwise: true },

            { type: "line", start: [20, 10], end: [20, 2] },

            // 右下：点(20,2)是 +x => 0°，点(18,0)是 -z => -90°（顺时针 90°）
            { type: "arc", center: [18, 2], radius: 2, startAngle: 0, endAngle: -90, clockwise: true },

            { type: "line", start: [18, 0], end: [2, 0] },

            // 左下：点(2,0)是 -z => -90°，点(0,2)是 -x => -180°（顺时针 90°）
            { type: "arc", center: [2, 2], radius: 2, startAngle: -90, endAngle: -180, clockwise: true },

            { type: "line", start: [0, 2], end: [0, 10] },

            // 左上：点(0,10)是 -x => 180°，点(2,12)是 +z => 90°（顺时针 90°）
            { type: "arc", center: [2, 10], radius: 2, startAngle: 180, endAngle: 90, clockwise: true },
        ]
    };
    
    return loadTrackData(demoTrack);
}

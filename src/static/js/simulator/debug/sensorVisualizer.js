/**
 * simulator/debug/sensorVisualizer.js
 * 探头可视化模块（调试用）
 * 
 * 功能：
 * - 在 3D 场景中显示探头位置
 * - 显示探头检测状态（绿=命中，红=未命中）
 * - 显示轨道路径
 * - 可独立启用/禁用
 */

import * as THREE from 'three';
import * as runtime from '../runtime.js';
import { getSensorPositions, getLastSensorReadings } from '../car/sensors/sensorArray.js';
import { getLineFollowerResult, isLineFollowerEnabled } from '../car/control/lineFollower.js';
import { getTrackWaypoints, getTrackWidth, isTrackLoaded } from '../map/trackMap/trackLoader.js';
import { carCurrentPosition } from '../car/state.js';
import { localToWorld } from '../car/sensors/sensorRaycast.js';

// ===== 可视化状态 =====
let visualizerEnabled = false;
let visualizerInitialized = false;

// ===== Three.js 对象 =====
let sensorGroup = null;        // 探头可视化组
let trackLineObject = null;    // 轨道路径线
let sensorMeshes = [];         // 探头网格数组

// ===== 材质 =====
let sensorHitMaterial = null;
let sensorMissMaterial = null;
let trackLineMaterial = null;

// ===== 配置 =====
const VISUALIZER_CONFIG = {
    sensorRadius: 0.05,      // 探头球体半径
    sensorHeight: 0.1,       // 探头离地高度
    trackLineHeight: 0.02,   // 轨道线离地高度
    trackLineColor: 0x000000 // 轨道线颜色（黑色）
};

// ===== 初始化可视化 =====
export function initSensorVisualizer() {
    if (visualizerInitialized) return;
    if (!runtime.scene) {
        console.warn('场景未初始化，无法初始化探头可视化');
        return;
    }
    
    // 创建材质
    sensorHitMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // 绿色
    sensorMissMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // 红色
    trackLineMaterial = new THREE.LineBasicMaterial({ 
        color: VISUALIZER_CONFIG.trackLineColor,
        linewidth: 3
    });
    
    // 创建探头组
    sensorGroup = new THREE.Group();
    sensorGroup.name = 'SensorVisualizerGroup';
    sensorGroup.visible = false;
    runtime.scene.add(sensorGroup);
    
    visualizerInitialized = true;
    console.log('✓ 探头可视化初始化完成');
}

// ===== 启用可视化 =====
export function enableSensorVisualizer() {
    if (!visualizerInitialized) {
        initSensorVisualizer();
    }
    
    visualizerEnabled = true;
    
    if (sensorGroup) {
        sensorGroup.visible = true;
    }
    
    // 创建探头网格
    createSensorMeshes();
    
    // 创建轨道线
    createTrackLine();
    
    console.log('✓ 探头可视化已启用');
}

// ===== 禁用可视化 =====
export function disableSensorVisualizer() {
    visualizerEnabled = false;
    
    if (sensorGroup) {
        sensorGroup.visible = false;
    }
    
    console.log('✓ 探头可视化已禁用');
}

// ===== 创建探头网格 =====
function createSensorMeshes() {
    // 清除旧的
    clearSensorMeshes();
    
    const sensorPositions = getSensorPositions();
    const geometry = new THREE.SphereGeometry(VISUALIZER_CONFIG.sensorRadius, 8, 8);
    
    for (let i = 0; i < sensorPositions.length; i++) {
        const mesh = new THREE.Mesh(geometry, sensorMissMaterial.clone());
        mesh.name = `Sensor_${i}`;
        sensorGroup.add(mesh);
        sensorMeshes.push(mesh);
    }
}

// ===== 清除探头网格 =====
function clearSensorMeshes() {
    for (const mesh of sensorMeshes) {
        sensorGroup.remove(mesh);
        mesh.geometry?.dispose();
        mesh.material?.dispose();
    }
    sensorMeshes = [];
}

// ===== 创建轨道线 =====
function createTrackLine() {
    // 清除旧的
    if (trackLineObject) {
        runtime.scene.remove(trackLineObject);
        trackLineObject.geometry?.dispose();
        trackLineObject = null;
    }
    
    if (!isTrackLoaded()) return;
    
    const waypoints = getTrackWaypoints();
    if (waypoints.length < 2) return;
    
    const points = waypoints.map(p => 
        new THREE.Vector3(p.x, VISUALIZER_CONFIG.trackLineHeight, p.z)
    );
    
    // 闭合轨道
    points.push(points[0].clone());
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    trackLineObject = new THREE.Line(geometry, trackLineMaterial);
    trackLineObject.name = 'TrackVisualizerLine';
    trackLineObject.frustumCulled = false;
    
    runtime.scene.add(trackLineObject);
}

// ===== 每帧更新可视化（由主循环调用） =====
export function updateSensorVisualizer() {
    if (!visualizerEnabled || !visualizerInitialized) return;
    if (!runtime.carModel) return;
    
    const result = getLineFollowerResult();
    const sensorPositions = getSensorPositions();
    
    // 获取小车位置
    const carX = carCurrentPosition.x;
    const carZ = carCurrentPosition.y;
    const carRotation = carCurrentPosition.rotation;
    
    // 更新每个探头的位置和颜色
    for (let i = 0; i < sensorMeshes.length && i < sensorPositions.length; i++) {
        const mesh = sensorMeshes[i];
        const sensor = sensorPositions[i];
        
        // 计算世界坐标
        const worldPos = localToWorld(sensor.localX, sensor.localZ, carX, carZ, carRotation);
        mesh.position.set(worldPos.x, VISUALIZER_CONFIG.sensorHeight, worldPos.z);
        
        // 更新颜色
        const hit = result.sensorReadings && result.sensorReadings[i] === 1;
        mesh.material.color.set(hit ? 0x00ff00 : 0xff0000);
    }
}

// ===== 检查是否启用 =====
export function isSensorVisualizerEnabled() {
    return visualizerEnabled;
}

// ===== 切换可视化 =====
export function toggleSensorVisualizer() {
    if (visualizerEnabled) {
        disableSensorVisualizer();
    } else {
        enableSensorVisualizer();
    }
    return visualizerEnabled;
}

// ===== 销毁可视化 =====
export function disposeSensorVisualizer() {
    disableSensorVisualizer();
    
    clearSensorMeshes();
    
    if (trackLineObject) {
        runtime.scene.remove(trackLineObject);
        trackLineObject.geometry?.dispose();
        trackLineObject = null;
    }
    
    if (sensorGroup) {
        runtime.scene.remove(sensorGroup);
        sensorGroup = null;
    }
    
    if (sensorHitMaterial) {
        sensorHitMaterial.dispose();
        sensorHitMaterial = null;
    }
    
    if (sensorMissMaterial) {
        sensorMissMaterial.dispose();
        sensorMissMaterial = null;
    }
    
    if (trackLineMaterial) {
        trackLineMaterial.dispose();
        trackLineMaterial = null;
    }
    
    visualizerInitialized = false;
    console.log('✓ 探头可视化已销毁');
}

// ===== 刷新轨道线（轨道加载后调用） =====
export function refreshTrackLine() {
    if (visualizerEnabled) {
        createTrackLine();
    }
}

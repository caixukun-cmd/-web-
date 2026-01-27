/**
 * simulator/path/recorder.js
 * 路径记录系统
 */

import * as THREE from 'three';
import * as runtime from '../runtime.js';
import { requestRender } from '../loop/perf.js';

export function initPathSystem() {
    const pathMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 2
    });
    
    const pathGeometry = new THREE.BufferGeometry();
    
    const pathLine = new THREE.Line(pathGeometry, pathMaterial);
    pathLine.name = 'CarPathLine';
    pathLine.frustumCulled = false;
    
    runtime.scene.add(pathLine);
    
    runtime.setPathLine(pathLine);
    runtime.setPathPoints([]);
    runtime.setLastPathPoint(null);
    
    console.log('✓ 路径记录系统初始化完成');
}

export function recordPathPoint(x, z) {
    if (!runtime.isRecordingPath) {
        return;
    }
    
    if (runtime.lastPathPoint) {
        const dx = x - runtime.lastPathPoint.x;
        const dz = z - runtime.lastPathPoint.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance < runtime.PATH_RECORD_INTERVAL) {
            return;
        }
    }
    
    const newPoint = new THREE.Vector3(x, runtime.PATH_Y_OFFSET, z);
    runtime.pathPoints.push(newPoint);
    runtime.setLastPathPoint({ x, z });
    
    updatePathGeometry();
}

function updatePathGeometry() {
    if (!runtime.pathLine || runtime.pathPoints.length < 2) return;
    
    const newGeometry = new THREE.BufferGeometry().setFromPoints(runtime.pathPoints);
    
    if (runtime.pathLine.geometry) {
        runtime.pathLine.geometry.dispose();
    }
    
    runtime.pathLine.geometry = newGeometry;
    requestRender();
}

export function clearPath() {
    runtime.setPathPoints([]);
    runtime.setLastPathPoint(null);
    
    if (runtime.pathLine && runtime.pathLine.geometry) {
        runtime.pathLine.geometry.dispose();
        runtime.pathLine.geometry = new THREE.BufferGeometry();
    }
    
    requestRender();
    console.log('✓ 路径轨迹已清除');
}

export function startPathRecording() {
    runtime.setIsRecordingPath(true);
    console.log('✓ 路径记录器已开启');
}

export function stopPathRecording() {
    runtime.setIsRecordingPath(false);
    console.log('✓ 路径记录器已关闭');
}

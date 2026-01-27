/**
 * simulator/loop/animate.js
 * 主渲染循环
 */

import * as runtime from '../runtime.js';
import { updateCarPositionSmooth } from '../car/smoothing.js';
import { applyFreeCamMovement } from '../camera/freeCam.js';
import { updateChunksByCarPosition } from '../map/chunkUpdate.js';
import { shouldRender, updateFPS, resetRenderFlag } from './perf.js';

// ===== 循线系统 Hook（可选，延迟加载） =====
let lineFollowerModule = null;
let sensorVisualizerModule = null;
let lineFollowerHookEnabled = false;

// 启用循线系统 Hook
export async function enableLineFollowerHook() {
    if (!lineFollowerModule) {
        lineFollowerModule = await import('../car/control/lineFollower.js');
    }
    if (!sensorVisualizerModule) {
        sensorVisualizerModule = await import('../debug/sensorVisualizer.js');
    }
    lineFollowerHookEnabled = true;
    console.log('✓ 循线系统 Hook 已启用');
}

// 禁用循线系统 Hook
export function disableLineFollowerHook() {
    lineFollowerHookEnabled = false;
    console.log('✓ 循线系统 Hook 已禁用');
}

// 检查 Hook 是否启用
export function isLineFollowerHookEnabled() {
    return lineFollowerHookEnabled;
}

export function startLoop() {
    animate();
}

export function stopLoop() {
    if (runtime.animationFrameId !== null) {
        cancelAnimationFrame(runtime.animationFrameId);
        runtime.setAnimationFrameId(null);
    }
}

function animate() {
    runtime.setAnimationFrameId(requestAnimationFrame(animate));

    // 1. 平滑更新小车位置
    updateCarPositionSmooth();
    
    // 2. 更新 Chunk
    updateChunksByCarPosition();
    
    // 2.5 更新循线系统（如果启用）
    if (lineFollowerHookEnabled && lineFollowerModule) {
        lineFollowerModule.updateLineFollower();
        
        // 更新探头可视化
        if (sensorVisualizerModule) {
            sensorVisualizerModule.updateSensorVisualizer();
        }
    }

    // 3. 更新控制器
    let cameraChanged = false;
    if (runtime.controls) {
        runtime.controls.update();
    }

    // 4. 自由视角键盘移动
    if (runtime.cameraMode === 'orbit' && runtime.activeCamera === runtime.camera) {
        cameraChanged = applyFreeCamMovement() || cameraChanged;
    }

    // 5. 检查相机是否移动
    cameraChanged = checkCameraChanged() || cameraChanged;

    // 6. 按需渲染
    if (shouldRender(cameraChanged)) {
        updateFPS();

        const renderCamera = runtime.activeCamera || runtime.camera;
        if (runtime.renderer && runtime.scene && renderCamera) {
            runtime.renderer.render(runtime.scene, renderCamera);
        }

        if (runtime.needsRender && runtime.renderer.shadowMap.enabled) {
            runtime.renderer.shadowMap.needsUpdate = true;
        }

        resetRenderFlag();
    }
}

function checkCameraChanged() {
    if (!runtime.camera) return false;
    
    const currentPos = runtime.camera.position.clone();
    const currentRot = runtime.camera.rotation.clone();

    const posThreshold = 0.001;
    const rotThreshold = 0.001;

    if (currentPos.distanceTo(runtime.lastCameraPosition) > posThreshold ||
        Math.abs(currentRot.x - runtime.lastCameraRotation.x) > rotThreshold ||
        Math.abs(currentRot.y - runtime.lastCameraRotation.y) > rotThreshold ||
        Math.abs(currentRot.z - runtime.lastCameraRotation.z) > rotThreshold) {
        
        runtime.lastCameraPosition.copy(currentPos);
        runtime.lastCameraRotation.copy(currentRot);
        return true;
    }
    
    return false;
}

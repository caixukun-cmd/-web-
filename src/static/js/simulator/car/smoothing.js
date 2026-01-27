/**
 * simulator/car/smoothing.js
 * 每帧平滑插值更新小车位置
 */

import * as runtime from '../runtime.js';
import {
    carCurrentPosition,
    carTargetPosition,
    carState,
    lastRotationUpdateTime,
    setLastRotationUpdateTime,
    ROTATION_LERP_FACTOR,
    ROTATION_MAX_SPEED,
    ROTATION_MIN_SPEED
} from './state.js';
import { recordPathPoint } from '../path/recorder.js';
import { updateFollowCamera } from '../camera/modes.js';
import { requestRender } from '../loop/perf.js';

export function updateCarPositionSmooth() {
    if (!runtime.carModel) return;
    
    const positionLerpFactor = 0.15;
    
    // 位置插值
    carCurrentPosition.x += (carTargetPosition.x - carCurrentPosition.x) * positionLerpFactor;
    carCurrentPosition.y += (carTargetPosition.y - carCurrentPosition.y) * positionLerpFactor;
    
    // 旋转插值
    const currentTime = performance.now();
    let deltaTime = (currentTime - lastRotationUpdateTime) / 1000;
    
    if (deltaTime <= 0 || deltaTime > 0.1) {
        deltaTime = 0.016;
    }
    
    setLastRotationUpdateTime(currentTime);
    
    // 计算旋转差值（处理角度环绕）
    let rotDiff = carTargetPosition.rotation - carCurrentPosition.rotation;
    if (rotDiff > 180) rotDiff -= 360;
    if (rotDiff < -180) rotDiff += 360;
    
    if (Math.abs(rotDiff) < 0.01) {
        carCurrentPosition.rotation = carTargetPosition.rotation;
    } else {
        let targetRotSpeed;
        const absRotDiff = Math.abs(rotDiff);
        
        if (absRotDiff > 45) {
            targetRotSpeed = ROTATION_MAX_SPEED;
        } else if (absRotDiff < 2) {
            const lerpIncrement = rotDiff * ROTATION_LERP_FACTOR;
            carCurrentPosition.rotation += lerpIncrement;
            normalizeRotation();
            applyCarTransform();
            requestRender();
            return;
        } else {
            const t = (absRotDiff - 2) / 43;
            targetRotSpeed = ROTATION_MIN_SPEED + (ROTATION_MAX_SPEED - ROTATION_MIN_SPEED) * t;
        }
        
        const rotIncrement = Math.sign(rotDiff) * targetRotSpeed * deltaTime;
        
        if (Math.abs(rotIncrement) >= Math.abs(rotDiff)) {
            carCurrentPosition.rotation = carTargetPosition.rotation;
        } else {
            carCurrentPosition.rotation += rotIncrement;
        }
    }
    
    normalizeRotation();
    applyCarTransform();
    
    // 记录路径点
    recordPathPoint(carCurrentPosition.x, carCurrentPosition.y);
    
    // 更新跟随相机
    if (runtime.followCamera && runtime.cameraMode === 'car_front') {
        updateFollowCamera();
    }
    
    requestRender();
}

function normalizeRotation() {
    while (carCurrentPosition.rotation < 0) carCurrentPosition.rotation += 360;
    while (carCurrentPosition.rotation >= 360) carCurrentPosition.rotation -= 360;
}

function applyCarTransform() {
    runtime.carModel.position.x = carCurrentPosition.x;
    runtime.carModel.position.z = carCurrentPosition.y;
    runtime.carModel.rotation.y = carCurrentPosition.rotation * Math.PI / 180;
}

// 导出给 status 消息使用的强制同步函数
export function forceSync() {
    if (!runtime.carModel) return;
    
    carCurrentPosition.x = carState.position.x || 0;
    carCurrentPosition.y = carState.position.y || 0;
    carCurrentPosition.rotation = carState.rotation || 0;
    carTargetPosition.x = carState.position.x || 0;
    carTargetPosition.y = carState.position.y || 0;
    carTargetPosition.rotation = carState.rotation || 0;
    
    normalizeRotation();
    applyCarTransform();
    setLastRotationUpdateTime(performance.now());
}

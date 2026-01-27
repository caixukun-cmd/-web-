/**
 * simulator/camera/modes.js
 * 相机模式切换与跟随相机更新
 */

import * as THREE from 'three';
import * as runtime from '../runtime.js';
import { requestRender } from '../loop/perf.js';

export function setCameraMode(mode) {
    if (mode !== 'orbit' && mode !== 'car_front') {
        console.warn('未知相机模式:', mode);
        return;
    }

    runtime.setCameraModeValue(mode);

    if (mode === 'orbit') {
        runtime.setActiveCamera(runtime.camera || runtime.activeCamera);
        if (runtime.controls) {
            runtime.controls.enabled = true;
        }
    } else if (mode === 'car_front') {
        runtime.setActiveCamera(runtime.followCamera || runtime.camera || runtime.activeCamera);
        if (runtime.controls) {
            runtime.controls.enabled = false;
        }
    }

    requestRender();
}

export function updateFollowCamera() {
    if (!runtime.followCamera || !runtime.carModel) return;
    
    // 复用向量对象，避免频繁创建
    if (!runtime.followCamera._cameraOffset) {
        runtime.followCamera._cameraOffset = new THREE.Vector3(0, 0.7, 1.2);
        runtime.followCamera._lookAtOffset = new THREE.Vector3(0, 0.4, 4.0);
        runtime.followCamera._worldCameraPos = new THREE.Vector3();
        runtime.followCamera._worldLookAtPos = new THREE.Vector3();
    }
    
    runtime.followCamera._worldCameraPos.copy(runtime.followCamera._cameraOffset);
    runtime.followCamera._worldLookAtPos.copy(runtime.followCamera._lookAtOffset);
    
    runtime.carModel.localToWorld(runtime.followCamera._worldCameraPos);
    runtime.carModel.localToWorld(runtime.followCamera._worldLookAtPos);
    
    runtime.followCamera.position.copy(runtime.followCamera._worldCameraPos);
    runtime.followCamera.lookAt(runtime.followCamera._worldLookAtPos);
}

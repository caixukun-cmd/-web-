/**
 * simulator/camera/reset.js
 * 重置自由视角相机
 */

import * as runtime from '../runtime.js';
import { clearPath } from '../path/recorder.js';
import { requestRender } from '../loop/perf.js';

export function resetFreeCamera() {
    if (!runtime.camera || !runtime.controls) {
        console.warn('相机或控制器未初始化，无法重置');
        return;
    }

    runtime.camera.position.copy(runtime.initialCameraPosition);
    runtime.controls.target.copy(runtime.initialCameraTarget);
    runtime.controls.update();
    runtime.camera.lookAt(runtime.initialCameraTarget);
    
    runtime.lastCameraPosition.copy(runtime.camera.position);
    runtime.lastCameraRotation.copy(runtime.camera.rotation);
    
    clearPath();
    requestRender();
    
    console.log('✓ 自由视角相机已重置到初始位置');
}

/**
 * simulator/scene/resize.js
 * 窗口自适应
 */

import * as runtime from '../runtime.js';
import { requestRender } from '../loop/perf.js';

export function onWindowResize() {
    const container = runtime.renderer.domElement.parentElement;
    if (!container) return;

    const aspect = container.clientWidth / container.clientHeight;

    if (runtime.camera) {
        runtime.camera.aspect = aspect;
        runtime.camera.updateProjectionMatrix();
    }

    if (runtime.followCamera) {
        runtime.followCamera.aspect = aspect;
        runtime.followCamera.updateProjectionMatrix();
    }

    runtime.renderer.setSize(container.clientWidth, container.clientHeight);
    requestRender();
}

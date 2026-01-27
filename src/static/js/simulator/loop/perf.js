/**
 * simulator/loop/perf.js
 * FPS 监控与按需渲染
 */

import * as runtime from '../runtime.js';

export function requestRender() {
    runtime.setNeedsRender(true);
}

export function shouldRender(cameraChanged) {
    return runtime.needsRender || cameraChanged;
}

export function updateFPS() {
    const currentTime = performance.now();
    runtime.fpsMonitor.frameCount++;

    if (currentTime >= runtime.fpsMonitor.lastTime + 1000) {
        runtime.fpsMonitor.fps = runtime.fpsMonitor.frameCount;
        runtime.fpsMonitor.frameCount = 0;
        runtime.fpsMonitor.lastTime = currentTime;

        if (runtime.fpsMonitor.fps < 30) {
            console.warn(`FPS 较低: ${runtime.fpsMonitor.fps}，考虑降低渲染质量`);
        }
    }
}

export function getFPS() {
    return runtime.fpsMonitor.fps;
}

export function resetRenderFlag() {
    runtime.setNeedsRender(false);
}

/**
 * simulator/vision/obstacleProjector.js
 * 基于仿真真值的障碍物投影检测器。
 */

import * as THREE from 'three';
import * as runtime from '../runtime.js';
import { sendMessage } from '../net/wsClient.js';

const LABEL_CLASS_ID = 0;
const LABEL_CLASS_NAME = 'obstacle';
const MODEL_NAME = 'sim-ground-truth-detector';

const _box3 = new THREE.Box3();
const _boxCenter = new THREE.Vector3();
const _projPoint = new THREE.Vector3();
const _corners = Array.from({ length: 8 }, () => new THREE.Vector3());
const _worldCorners = Array.from({ length: 8 }, () => new THREE.Vector3());

let overlayCanvas = null;
let overlayContext = null;
let lastProjectionMessage = null;

function ensureOverlayCanvas() {
    const renderer = runtime.renderer;
    if (!renderer || !renderer.domElement) return null;

    const container = renderer.domElement.parentElement;
    if (!container) return null;

    if (!overlayCanvas) {
        overlayCanvas = document.createElement('canvas');
        overlayCanvas.id = 'vision-projection-overlay';
        overlayCanvas.style.position = 'absolute';
        overlayCanvas.style.left = '0';
        overlayCanvas.style.top = '0';
        overlayCanvas.style.width = '100%';
        overlayCanvas.style.height = '100%';
        overlayCanvas.style.pointerEvents = 'none';
        overlayCanvas.style.zIndex = '10';
        container.appendChild(overlayCanvas);
        overlayContext = overlayCanvas.getContext('2d');
    }

    const width = container.clientWidth;
    const height = container.clientHeight;

    if (overlayCanvas.width !== width || overlayCanvas.height !== height) {
        overlayCanvas.width = width;
        overlayCanvas.height = height;
    }

    return overlayCanvas;
}

function clearOverlay() {
    if (!overlayCanvas || !overlayContext) return;
    overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

function collectObstacleMeshes() {
    const obstacles = [];
    if (!runtime.scene) return obstacles;

    runtime.scene.traverse((object) => {
        if (!object || !object.isMesh) return;
        if (object.userData?.isObstacle !== true) return;
        obstacles.push(object);
    });

    return obstacles;
}

function computeScreenBBox(mesh, camera, width, height) {
    _box3.setFromObject(mesh);
    if (_box3.isEmpty()) return null;

    _box3.getCenter(_boxCenter);
    _projPoint.copy(_boxCenter).project(camera);

    // 目标中心不在视锥范围内时直接跳过，避免出现屏幕后方的无意义框。
    if (_projPoint.z < -1 || _projPoint.z > 1) {
        return null;
    }

    const min = _box3.min;
    const max = _box3.max;
    const cornerValues = [
        [min.x, min.y, min.z],
        [min.x, min.y, max.z],
        [min.x, max.y, min.z],
        [min.x, max.y, max.z],
        [max.x, min.y, min.z],
        [max.x, min.y, max.z],
        [max.x, max.y, min.z],
        [max.x, max.y, max.z],
    ];

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let visibleCornerCount = 0;

    for (let i = 0; i < cornerValues.length; i++) {
        _corners[i].set(cornerValues[i][0], cornerValues[i][1], cornerValues[i][2]);
        _worldCorners[i].copy(_corners[i]).project(camera);
        const p = _worldCorners[i];

        if (Number.isNaN(p.x) || Number.isNaN(p.y) || Number.isNaN(p.z)) {
            continue;
        }

        if (p.z >= -1 && p.z <= 1) {
            visibleCornerCount += 1;
        }

        const screenX = ((p.x + 1) / 2) * width;
        const screenY = ((1 - p.y) / 2) * height;

        minX = Math.min(minX, screenX);
        minY = Math.min(minY, screenY);
        maxX = Math.max(maxX, screenX);
        maxY = Math.max(maxY, screenY);
    }

    if (visibleCornerCount === 0) {
        return null;
    }

    minX = Math.max(0, Math.min(width, minX));
    minY = Math.max(0, Math.min(height, minY));
    maxX = Math.max(0, Math.min(width, maxX));
    maxY = Math.max(0, Math.min(height, maxY));

    const bboxWidth = maxX - minX;
    const bboxHeight = maxY - minY;

    if (bboxWidth < 2 || bboxHeight < 2) {
        return null;
    }

    return {
        x1: Math.round(minX),
        y1: Math.round(minY),
        x2: Math.round(maxX),
        y2: Math.round(maxY),
        width: Math.round(bboxWidth),
        height: Math.round(bboxHeight),
    };
}

function buildProjectionResult() {
    const canvas = ensureOverlayCanvas();
    const camera = runtime.activeCamera;
    if (!canvas || !camera || !runtime.renderer || !runtime.scene) {
        return null;
    }

    const detections = [];
    const obstacles = collectObstacleMeshes();
    const width = canvas.width;
    const height = canvas.height;

    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    for (const obstacle of obstacles) {
        const bbox = computeScreenBBox(obstacle, camera, width, height);
        if (!bbox) continue;

        detections.push({
            obstacle_id: obstacle.userData?.obstacleId ?? null,
            class_id: LABEL_CLASS_ID,
            class_name: obstacle.userData?.label || LABEL_CLASS_NAME,
            confidence: 1.0,
            bbox,
        });
    }

    return {
        type: 'vision_projection_result',
        model: MODEL_NAME,
        timestamp: Date.now(),
        detections,
    };
}

function drawDetections(result) {
    const canvas = ensureOverlayCanvas();
    if (!canvas || !overlayContext) return;

    overlayContext.clearRect(0, 0, canvas.width, canvas.height);

    const detections = Array.isArray(result?.detections) ? result.detections : [];
    if (!detections.length) return;

    overlayContext.save();
    overlayContext.lineWidth = 2;
    overlayContext.font = '12px Consolas, Monaco, monospace';
    overlayContext.textBaseline = 'top';

    detections.forEach((item) => {
        const bbox = item.bbox;
        if (!bbox) return;

        overlayContext.strokeStyle = '#00ff88';
        overlayContext.fillStyle = 'rgba(0, 255, 136, 0.16)';
        overlayContext.strokeRect(bbox.x1, bbox.y1, bbox.width, bbox.height);
        overlayContext.fillRect(bbox.x1, bbox.y1, bbox.width, bbox.height);

        const label = `${item.class_name ?? LABEL_CLASS_NAME} ${(item.confidence ?? 1).toFixed(2)}`;
        const textWidth = Math.ceil(overlayContext.measureText(label).width);
        const textX = bbox.x1;
        const textY = Math.max(0, bbox.y1 - 18);

        overlayContext.fillStyle = 'rgba(0, 255, 136, 0.92)';
        overlayContext.fillRect(textX, textY, textWidth + 10, 16);
        overlayContext.fillStyle = '#04150d';
        overlayContext.fillText(label, textX + 5, textY + 2);
    });

    overlayContext.restore();
}

export function updateObstacleProjection() {
    const shouldProject = runtime.cameraMode === 'car_front' && runtime.activeCamera === runtime.followCamera;

    if (!shouldProject) {
        lastProjectionMessage = null;
        clearOverlay();
        return null;
    }

    const result = buildProjectionResult();
    if (!result) {
        clearOverlay();
        return null;
    }

    drawDetections(result);
    lastProjectionMessage = result;

    if (runtime.isConnected) {
        sendMessage(result);
    }

    return result;
}

export function getLastProjectionResult() {
    return lastProjectionMessage;
}

export function onProjectionViewportResize() {
    ensureOverlayCanvas();
    if (lastProjectionMessage) {
        drawDetections(lastProjectionMessage);
    } else {
        clearOverlay();
    }
}

export function disposeObstacleProjection() {
    clearOverlay();
    lastProjectionMessage = null;

    if (overlayCanvas && overlayCanvas.parentElement) {
        overlayCanvas.parentElement.removeChild(overlayCanvas);
    }

    overlayCanvas = null;
    overlayContext = null;
}

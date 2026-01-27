/**
 * simulator/camera/freeCam.js
 * 键盘自由视角控制
 */

import * as THREE from 'three';
import * as runtime from '../runtime.js';
import { requestRender } from '../loop/perf.js';

export function bindFreeCamKeys() {
    const keyDownHandler = (event) => handleFreeCameraKey(event, true);
    const keyUpHandler = (event) => handleFreeCameraKey(event, false);
    
    window.addEventListener('keydown', keyDownHandler);
    window.addEventListener('keyup', keyUpHandler);
    
    runtime.setKeyDownHandler(keyDownHandler);
    runtime.setKeyUpHandler(keyUpHandler);
}

export function unbindFreeCamKeys() {
    if (runtime.keyDownHandler) {
        window.removeEventListener('keydown', runtime.keyDownHandler);
        runtime.setKeyDownHandler(null);
    }
    if (runtime.keyUpHandler) {
        window.removeEventListener('keyup', runtime.keyUpHandler);
        runtime.setKeyUpHandler(null);
    }
}

function handleFreeCameraKey(event, isDown) {
    const code = event.code;

    if (code in runtime.freeCamKeyState) {
        runtime.freeCamKeyState[code] = isDown;

        if (code.startsWith('Arrow')) {
            event.preventDefault();
        }

        requestRender();
    }
}

export function applyFreeCamMovement() {
    const freeCamMoving =
        runtime.freeCamKeyState.ArrowUp ||
        runtime.freeCamKeyState.ArrowDown ||
        runtime.freeCamKeyState.ArrowLeft ||
        runtime.freeCamKeyState.ArrowRight;

    if (!freeCamMoving || !runtime.camera) {
        return false;
    }

    const forward = new THREE.Vector3();
    runtime.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0) {
        forward.normalize();
    }

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const move = new THREE.Vector3();

    if (runtime.freeCamKeyState.ArrowUp) move.add(forward);
    if (runtime.freeCamKeyState.ArrowDown) move.sub(forward);
    if (runtime.freeCamKeyState.ArrowRight) move.add(right);
    if (runtime.freeCamKeyState.ArrowLeft) move.sub(right);

    if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(runtime.FREE_CAM_MOVE_SPEED);

        runtime.camera.position.add(move);
        if (runtime.controls) {
            runtime.controls.target.add(move);
        }
        return true;
    }
    
    return false;
}

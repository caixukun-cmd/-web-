/**
 * simulator/scene/dispose.js
 * 释放资源 & 解绑事件
 */

import * as runtime from '../runtime.js';
import { stopLoop } from '../loop/animate.js';
import { unbindFreeCamKeys } from '../camera/freeCam.js';
import { ChunkManager } from '../map/chunkManager.js';
import { onWindowResize } from './resize.js';

export function dispose() {
    stopLoop();

    // 清理 Chunk 系统
    if (ChunkManager.chunkGroup) {
        ChunkManager.clear();
        if (runtime.scene && ChunkManager.chunkGroup) {
            runtime.scene.remove(ChunkManager.chunkGroup);
        }
    }

    unbindFreeCamKeys();

    if (runtime.renderer) {
        runtime.renderer.dispose();
    }
    if (runtime.controls) {
        runtime.controls.dispose();
    }
    if (runtime.socket) {
        runtime.socket.close();
    }
    
    runtime.setIsConnected(false);
    window.removeEventListener('resize', onWindowResize);
}

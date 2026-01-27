/**
 * simulator/map/chunkUpdate.js
 * 每帧根据小车位置更新 Chunk
 */

import * as runtime from '../runtime.js';
import { ChunkManager } from './chunkManager.js';
import { generateChunk } from './chunkGen.js';

const CHUNK_RANGE = 2;
const ENABLE_DEBUG = false;

export function updateChunksByCarPosition() {
    if (!runtime.carModel) return;

    const x = runtime.carModel.position.x;
    const z = runtime.carModel.position.z;

    const { x: cx, z: cz } = ChunkManager.getChunkCoord(x, z);

    const needed = new Set();

    for (let dx = -CHUNK_RANGE; dx <= CHUNK_RANGE; dx++) {
        for (let dz = -CHUNK_RANGE; dz <= CHUNK_RANGE; dz++) {
            const nx = cx + dx;
            const nz = cz + dz;
            const key = `${nx}_${nz}`;

            needed.add(key);

            if (!ChunkManager.loadedChunks.has(key)) {
                const chunk = generateChunk(nx, nz);
                ChunkManager.addChunk(nx, nz, chunk);

                if (ENABLE_DEBUG) {
                    console.log('Chunk loaded:', key);
                }
            }
        }
    }

    // 卸载不需要的 chunk
    ChunkManager.loadedChunks.forEach((_, key) => {
        if (!needed.has(key)) {
            const [x, z] = key.split('_').map(Number);
            ChunkManager.removeChunk(x, z);

            if (ENABLE_DEBUG) {
                console.log('Chunk unloaded:', key);
            }
        }
    });
}

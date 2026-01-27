/**
 * simulator/map/chunkManager.js
 * Chunk 系统管理
 */

import * as THREE from 'three';

export const CHUNK_SIZE = 20;

export const ChunkManager = {
    chunkSize: CHUNK_SIZE,
    loadedChunks: new Map(),
    chunkGroup: null,

    init(scene) {
        this.chunkGroup = new THREE.Group();
        this.chunkGroup.name = 'ChunkGroup';
        scene.add(this.chunkGroup);
    },

    getChunkCoord(x, z) {
        return {
            x: Math.floor(x / this.chunkSize),
            z: Math.floor(z / this.chunkSize)
        };
    },

    addChunk(chunkX, chunkZ, mesh) {
        const key = `${chunkX}_${chunkZ}`;
        if (!this.loadedChunks.has(key)) {
            this.loadedChunks.set(key, mesh);
            if (this.chunkGroup) {
                this.chunkGroup.add(mesh);
            }
        }
    },

    removeChunk(chunkX, chunkZ) {
        const key = `${chunkX}_${chunkZ}`;
        const chunk = this.loadedChunks.get(key);
        if (chunk && this.chunkGroup) {
            this.chunkGroup.remove(chunk);
            chunk.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.loadedChunks.delete(key);
        }
    },
    
    clear() {
        this.loadedChunks.forEach((chunk) => {
            if (this.chunkGroup) {
                this.chunkGroup.remove(chunk);
            }
            chunk.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        });
        this.loadedChunks.clear();
    }
};

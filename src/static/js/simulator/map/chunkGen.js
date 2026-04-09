/**
 * simulator/map/chunkGen.js
 * Chunk 内容生成
 */

import * as THREE from 'three';
import { CHUNK_SIZE } from './chunkManager.js';

let obstacleSequence = 0;

export function generateChunk(cx, cz) {
    const group = new THREE.Group();
    group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);

    // 地面
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE),
        new THREE.MeshStandardMaterial({
            color: ((cx + cz) % 2 === 0) ? 0x6fa36f : 0x5c8c5c
        })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.castShadow = false;
    group.add(floor);

    // 示例障碍物（不影响小车逻辑，仅视觉）
    const obstacleCount = Math.abs((cx * 92821 + cz * 68917) % 4);

    for (let i = 0; i < obstacleCount; i++) {
        const obstacleSize = { width: 1, height: 1, depth: 1 };
        const obstacleId = `chunk_${cx}_${cz}_obstacle_${obstacleSequence++}`;
        const box = new THREE.Mesh(
            new THREE.BoxGeometry(obstacleSize.width, obstacleSize.height, obstacleSize.depth),
            new THREE.MeshStandardMaterial({ color: 0x666666 })
        );
        box.position.set(
            (Math.random() - 0.5) * CHUNK_SIZE * 0.7,
            obstacleSize.height / 2,
            (Math.random() - 0.5) * CHUNK_SIZE * 0.7
        );
        box.castShadow = true;
        box.receiveShadow = true;
        box.userData.isObstacle = true;
        box.userData.label = 'obstacle';
        box.userData.obstacleId = obstacleId;
        box.userData.size = obstacleSize;
        group.add(box);
    }

    return group;
}

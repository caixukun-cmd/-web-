/**
 * simulator/scene/modelLoader.js
 * 小车模型加载
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as runtime from '../runtime.js';
import { initCarState } from '../car/state.js';

export function loadCarModel() {
    const loader = new GLTFLoader();

    console.log('正在加载小车模型...');

    loader.load(
        '/assets/models/icar1.glb',
        (gltf) => {
            const carModel = gltf.scene;
            carModel.scale.set(1, 1, 1);
            carModel.position.set(0, 0.5, 0);
            carModel.rotation.y = Math.PI / 2;
            
            initCarState();
            
            carModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            runtime.scene.add(carModel);
            runtime.setCarModel(carModel);
            
            console.log('✓ 小车模型加载成功');

            const loading = document.querySelector('.loading');
            if (loading) {
                loading.remove();
            }
        },
        (xhr) => {
            const percent = (xhr.loaded / xhr.total * 100).toFixed(0);
            console.log(`加载进度: ${percent}%`);
        },
        (error) => {
            console.error('小车模型加载失败:', error);
            createFallbackCar();
        }
    );
}

function createFallbackCar() {
    console.log('使用备用小车模型');

    const carGroup = new THREE.Group();

    const bodyGeometry = new THREE.BoxGeometry(1, 0.5, 1.5);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xff6b6b });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.25;
    body.castShadow = true;
    carGroup.add(body);

    const wheelGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });

    const wheelPositions = [
        [-0.4, 0.2, 0.6],
        [0.4, 0.2, 0.6],
        [-0.4, 0.2, -0.6],
        [0.4, 0.2, -0.6]
    ];

    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.position.set(...pos);
        wheel.rotation.z = Math.PI / 2;
        wheel.castShadow = true;
        carGroup.add(wheel);
    });

    runtime.scene.add(carGroup);
    runtime.setCarModel(carGroup);
    
    initCarState();

    const loading = document.querySelector('.loading');
    if (loading) {
        loading.remove();
    }
}

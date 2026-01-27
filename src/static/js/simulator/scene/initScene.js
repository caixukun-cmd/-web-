/**
 * simulator/scene/initScene.js
 * 场景初始化
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as runtime from '../runtime.js';
import { ChunkManager } from '../map/chunkManager.js';
import { generateChunk } from '../map/chunkGen.js';
import { initPathSystem } from '../path/recorder.js';
import { startLoop } from '../loop/animate.js';
import { bindFreeCamKeys } from '../camera/freeCam.js';
import { initCarState } from '../car/state.js';
import { loadCarModel } from './modelLoader.js';
import { onWindowResize } from './resize.js';

export function initScene(container) {
    // 创建场景
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    runtime.setScene(scene);

    // 创建相机
    const aspect = container.clientWidth / container.clientHeight;
    const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    camera.position.copy(runtime.initialCameraPosition);
    camera.lookAt(runtime.initialCameraTarget);
    runtime.setCamera(camera);
    runtime.setActiveCamera(camera);

    // 创建跟随相机
    const followCamera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    followCamera.position.set(0, 1.0, 2.0);
    followCamera.lookAt(0, 0.5, 5.0);
    runtime.setFollowCamera(followCamera);

    // 初始化相机位置记录
    runtime.lastCameraPosition.copy(camera.position);
    runtime.lastCameraRotation.copy(camera.rotation);

    // 创建渲染器
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = true;
    container.appendChild(renderer.domElement);
    runtime.setRenderer(renderer);

    // 初始化 Chunk 系统
    ChunkManager.init(scene);
    runtime.setChunkManagerRef(ChunkManager);

    // 添加轨道控制器
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2;
    controls.minDistance = 5;
    controls.maxDistance = 50;
    controls.target.copy(runtime.initialCameraTarget);
    runtime.setControls(controls);

    // 添加光源
    addLights(scene);

    // 创建地面
    createGround();

    // 初始化路径系统
    initPathSystem();

    // 初始化小车状态
    initCarState();

    // 加载小车模型
    loadCarModel();

    // 绑定键盘事件
    bindFreeCamKeys();

    // 启动渲染循环
    startLoop();

    // 窗口自适应
    window.addEventListener('resize', onWindowResize);

    console.log('✓ Three.js 场景初始化完成');
}

function addLights(scene) {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 15);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 512;
    directionalLight.shadow.mapSize.height = 512;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    directionalLight.shadow.bias = -0.0001;
    directionalLight.shadow.radius = 1;

    scene.add(directionalLight);
}

function createGround() {
    for (let cx = -1; cx <= 1; cx++) {
        for (let cz = -1; cz <= 1; cz++) {
            const chunk = generateChunk(cx, cz);
            ChunkManager.addChunk(cx, cz, chunk);
        }
    }
    console.log('✓ 初始地面 Chunk 加载完成（3x3网格）');
}

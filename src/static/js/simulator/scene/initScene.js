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
    
    //创建起点旗帜
    createDoublePoleWithSingleFlag();

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

function createDoublePoleWithSingleFlag() {
    // --------------------- 创建第一根旗杆（左侧，X=-2） ---------------------
    const poleHeight = 3;
    const poleRadius = 0.05;
    
    // 左侧旗杆
    const pole1Geometry = new THREE.CylinderGeometry(poleRadius, poleRadius, poleHeight, 8);
    const pole1Material = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // 棕色
    const pole1 = new THREE.Mesh(pole1Geometry, pole1Material);
    pole1.position.set(-2, poleHeight / 2, 0); // 左侧旗杆位置（X=-2）
    pole1.castShadow = true;
    pole1.receiveShadow = true;
    runtime.scene.add(pole1);

    // --------------------- 创建第二根旗杆（右侧，X=2） ---------------------
    const pole2Geometry = new THREE.CylinderGeometry(poleRadius, poleRadius, poleHeight, 8);
    const pole2Material = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // 棕色
    const pole2 = new THREE.Mesh(pole2Geometry, pole2Material);
    pole2.position.set(2, poleHeight / 2, 0); // 右侧旗杆位置（X=2）
    pole2.castShadow = true;
    pole2.receiveShadow = true;
    runtime.scene.add(pole2);

    // --------------------- 创建单一面旗帜（垂直接触两根旗杆） ---------------------
    // 旗帜宽度：两根旗杆的间距（从X=-2到X=2，总宽度4）
    const flagWidth = 4; 
    // 旗帜高度：保持1.0，垂直方向尺寸
    const flagHeight = 1.0; 
    
    // 创建平面几何体（宽度对应X轴，高度对应Y轴）
    const flagGeometry = new THREE.PlaneGeometry(flagWidth, flagHeight);
    const flagMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xFF0000, // 红色
        side: THREE.DoubleSide, // 双面渲染
        transparent: true,
        opacity: 0.9
    });
    const flag = new THREE.Mesh(flagGeometry, flagMaterial);
    
    // 旗帜位置：X居中（0），Y在旗杆中上部（poleHeight - 0.1 避免贴顶），Z=0
    flag.position.set(0, poleHeight - 0.1, 0);
    // 取消旋转，让旗帜垂直（默认PlaneGeometry的平面是XY平面，刚好垂直）
    // 移除原有的旋转和偏移，保证旗帜边缘贴合旗杆
    flag.castShadow = true;
    
    runtime.scene.add(flag);
    
    console.log('✓ 双旗杆+单旗帜已添加（旗帜垂直接触两根旗杆）');
}
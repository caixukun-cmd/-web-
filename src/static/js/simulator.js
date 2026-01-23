/**
 * 智能小车仿真系统 - 核心逻辑
 * 基于 Three.js + WebSocket 实现
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ===== 全局变量 =====
let scene, camera, renderer, controls;
let carModel = null;
let socket = null;
let isConnected = false;

// 小车状态
let carState = {
    position: { x: 0, y: 0 },
    rotation: 0,
    speed: 0,
    isMoving: false
};

// ===== 1. 初始化 Three.js 场景 =====
export function initScene(container) {
    // 创建场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // 天蓝色背景

    // 创建相机
    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    camera.position.set(15, 12, 15);
    camera.lookAt(0, 0, 0);

    // 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 限制像素比，提升性能
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 添加轨道控制器
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2; // 限制不能看到地面下方
    controls.minDistance = 5;
    controls.maxDistance = 50;

    // 添加光源
    addLights();

    // 创建地面
    createGround();

    // 创建黑线路径
    drawLinePath();

    // 加载小车模型
    loadCarModel();

    // 启动渲染循环
    animate();

    // 窗口自适应
    window.addEventListener('resize', onWindowResize);

    console.log('✓ Three.js 场景初始化完成');
}

// ===== 2. 添加光源 =====
function addLights() {
    // 环境光（提供基础照明）
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // 平行光（模拟太阳，产生阴影）
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 15);
    directionalLight.castShadow = true;
    
    // 优化阴影
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    
    scene.add(directionalLight);
}

// ===== 3. 创建地面（40x40 网格） =====
function createGround() {
    // 地面网格
    const gridHelper = new THREE.GridHelper(40, 40, 0x888888, 0xcccccc);
    scene.add(gridHelper);

    // 地面平面（接收阴影）
    const groundGeometry = new THREE.PlaneGeometry(40, 40);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x228b22,
        roughness: 0.8,
        metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
}

// ===== 4. 创建黑线路径（循线轨道） =====
function drawLinePath() {
    // 创建一个简单的直线路径，从 (0, 0, -15) 到 (0, 0, 15)
    const points = [];
    for (let z = -15; z <= 15; z += 0.5) {
        points.push(new THREE.Vector3(0, 0.02, z)); // y=0.02 略高于地面
    }

    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0x000000, 
        linewidth: 3 
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    scene.add(line);

    // 可以扩展更复杂的路径（如转弯、圆形等）
    // 示例：添加一个转弯
    const turnPoints = [];
    for (let x = 0; x <= 10; x += 0.5) {
        turnPoints.push(new THREE.Vector3(x, 0.02, 15));
    }
    const turnGeometry = new THREE.BufferGeometry().setFromPoints(turnPoints);
    const turnLine = new THREE.Line(turnGeometry, lineMaterial);
    scene.add(turnLine);
}

// ===== 5. 加载小车模型 =====
function loadCarModel() {
    const loader = new GLTFLoader();
    
    // 显示加载提示
    console.log('正在加载小车模型...');

    loader.load(
        '/assets/models/icar1.glb',
        (gltf) => {
            carModel = gltf.scene;
            
            // 调整模型大小和位置
            carModel.scale.set(1, 1, 1);
            carModel.position.set(0, 0.5, 0);
            carModel.rotation.y = Math.PI / 2;     // 如果模型默认朝 +X（右侧朝前），旋转 90° 让正面朝 +Z
            // carModel.rotation.y = -Math.PI / 2;  // 如果默认朝 -X（左侧朝前）
            // carModel.rotation.y = Math.PI;       // 如果默认朝 -Z（背对前方）
            // carModel.rotation.y = 0;             // 
            // 启用阴影
            carModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            scene.add(carModel);
            console.log('✓ 小车模型加载成功');
            console.log('模型位置:', carModel.position);
            
            // 移除加载提示
            const loading = document.querySelector('.loading');
            if (loading) {
                loading.remove();
            }
        },
        (xhr) => {
            // 加载进度
            const percent = (xhr.loaded / xhr.total * 100).toFixed(0);
            console.log(`加载进度: ${percent}%`);
        },
        (error) => {
            console.error('小车模型加载失败:', error);
            // 如果模型加载失败，使用程序化创建的简单模型
            createFallbackCar();
        }
    );
}

// ===== 6. 创建备用小车（模型加载失败时使用） =====
function createFallbackCar() {
    console.log('使用备用小车模型');
    
    const carGroup = new THREE.Group();

    // 车身（蓝色长方体）
    const bodyGeometry = new THREE.BoxGeometry(1, 0.5, 1.5);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xff6b6b });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.25;
    body.castShadow = true;
    carGroup.add(body);

    // 车轮（4个黑色圆柱）
    const wheelGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    
    const wheelPositions = [
        [-0.4, 0.2, 0.6],   // 左前
        [0.4, 0.2, 0.6],    // 右前
        [-0.4, 0.2, -0.6],  // 左后
        [0.4, 0.2, -0.6]    // 右后
    ];
    
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.position.set(...pos);
        wheel.rotation.z = Math.PI / 2;
        wheel.castShadow = true;
        carGroup.add(wheel);
    });

    carModel = carGroup;
    scene.add(carModel);
    
    // 移除加载提示
    const loading = document.querySelector('.loading');
    if (loading) {
        loading.remove();
    }
}

// ===== 7. WebSocket 连接 =====
export function connectWebSocket(url, callbacks = {}) {
    console.log(`正在连接 WebSocket: ${url}`);
    
    // 如果已有连接，先关闭它
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
    }
    
    // 创建新的 WebSocket 连接
    const newSocket = new WebSocket(url);
    
    // 更新全局 socket 变量
    socket = newSocket;

    socket.onopen = () => {
        isConnected = true;
        console.log('✓ WebSocket 连接成功');
        if (callbacks.onOpen) callbacks.onOpen();
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data, callbacks);
        } catch (error) {
            console.error('解析 WebSocket 消息失败:', error);
        }
    };

    socket.onerror = (error) => {
        console.error('WebSocket 错误:', error);
        if (callbacks.onError) callbacks.onError(error);
    };

    socket.onclose = () => {
        isConnected = false;
        console.log('WebSocket 连接已关闭');
        if (callbacks.onClose) callbacks.onClose();
    };
    
    // 返回连接对象，用于前端关闭连接
    return socket;
}

// ===== 8. 处理 WebSocket 消息 =====
function handleWebSocketMessage(data, callbacks) {
    const { type } = data;
    console.log('[DEBUG] Received WebSocket message:', data); // 保持调试

    switch (type) {
        case 'position':
            updateCarPosition(data.x, data.y, data.rotation);
            // 更新 UI
            if (data.x !== undefined && data.y !== undefined) {
                document.getElementById('posX').textContent = data.x.toFixed(2);
                document.getElementById('posY').textContent = data.y.toFixed(2);
            }
            break;

        case 'status':
            carState.speed = data.speed;
            carState.isMoving = data.isMoving;
            document.getElementById('speed').textContent = data.speed.toFixed(2);

            if (data.speed === 0 && !data.isMoving) {
                // 强制本地模型静止，防止残留动画
                if (carModel) {
                    carModel.position.x = carState.position.x || 0;
                    carModel.position.z = carState.position.y || 0;
                    // 如果有任何 Tween/动画，杀掉
                    // TweenMax.killTweensOf(carModel); // 如果用了 GSAP
                }
                console.log('[DEBUG] 前端强制静止模型');
            }
            break;


        case 'log':
            if (callbacks.onLog) callbacks.onLog(data.message, data.level);
            break;

        case 'error':
            if (callbacks.onError) callbacks.onError(data.message);
            break;

        case 'complete':
            if (callbacks.onComplete) callbacks.onComplete(data.message);
            break;

        default:
            console.log('未知消息类型:', type, data);
    }
}

// ===== 9. 更新小车位置 =====
function updateCarPosition(x, y, rotation) {
    console.log('[DEBUG] updateCarPosition called with:', x, y, rotation); // 调试信息
    if (!carModel) {
        console.log('[DEBUG] carModel is null, skipping position update'); // 调试信息
        return;
    }
    // 更新内部状态
    carState.position.x = x;
    carState.position.y = y;
    carState.rotation = rotation;

    console.log('[DEBUG] Updated internal state, now updating Three.js model'); // 调试信息

    // Three.js 坐标系转换：
    // 后端: x=左右, y=前后
    // Three.js: x=左右, z=前后, y=上下
    carModel.position.x = x;
    carModel.position.z = y;
    carModel.rotation.y = rotation * Math.PI / 180; // 转为弧度，并取反
    
    console.log('[DEBUG] Three.js model updated, x:', carModel.position.x, 'z:', carModel.position.z, 'rotation.y:', carModel.rotation.y); // 调试信息
}

// ===== 10. 发送消息到后端 =====
export function sendMessage(message) {
    // 校验 WebSocket 连接状态
    if (socket && socket.readyState === WebSocket.OPEN && isConnected) {
        socket.send(JSON.stringify(message));
        return true;
    } else {
        console.warn('WebSocket 未连接或连接状态异常:', socket ? socket.readyState : 'null');
        // 通知前端连接状态异常
        if (window.updateConnectionStatus) {
            window.updateConnectionStatus(false);
        }
        if (window.addConsoleLog) {
            window.addConsoleLog('WebSocket连接异常，无法发送消息', 'error');
        }
        return false;
    }
}

// ===== 11. 渲染循环 =====
function animate() {
    requestAnimationFrame(animate);
    
    // 更新控制器
    if (controls) {
        controls.update();
    }

    // 渲染场景
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// ===== 12. 窗口自适应 =====
function onWindowResize() {
    const container = renderer.domElement.parentElement;
    if (!container) return;

    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}


// ===== 14. 清理资源 =====
export function dispose() {
    if (renderer) {
        renderer.dispose();
    }
    if (controls) {
        controls.dispose();
    }
    if (socket) {
        socket.close();
    }
    // 重置连接状态
    isConnected = false;
    window.removeEventListener('resize', onWindowResize);
}

// ===== 15. 获取当前状态 =====
export function getCarState() {
    return { ...carState };
}

export function isWebSocketConnected() {
    return isConnected;
}

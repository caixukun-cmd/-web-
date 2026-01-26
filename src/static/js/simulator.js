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

// 相机相关
let followCamera = null;       // 绑定在小车前方的机位
let activeCamera = null;       // 当前用于渲染的相机
let cameraMode = 'orbit';      // 'orbit' | 'car_front'
let initialCameraPosition = new THREE.Vector3(15, 12, 15);  // 初始相机位置
let initialCameraTarget = new THREE.Vector3(0, 0, 0);      // 初始相机目标点

// 自由视角键盘控制
const freeCamKeyState = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
};
let keyDownHandler = null;
let keyUpHandler = null;
const FREE_CAM_MOVE_SPEED = 0.2; // 自由视角移动速度（单位：世界坐标）

// 小车状态
let carState = {
    position: { x: 0, y: 0 },
    rotation: 0,
    speed: 0,
    isMoving: false
};

// 小车插值目标（用于平滑移动）
let carTargetPosition = { x: 0, y: 0, rotation: 0 };
let carCurrentPosition = { x: 0, y: 0, rotation: 0 };

// 旋转插值配置
const ROTATION_LERP_FACTOR = 0.2;       // 旋转插值系数（用于小角度平滑）
const ROTATION_MAX_SPEED = 360;          // 最大旋转速度（度/秒），提升到360度/秒让转向更流畅
const ROTATION_MIN_SPEED = 90;          // 最小旋转速度（度/秒），确保即使小角度也有动画
let lastRotationUpdateTime = performance.now();

// UI更新节流（避免频繁DOM操作）
let lastUIUpdateTime = 0;
const UI_UPDATE_INTERVAL = 100; // 每100ms更新一次UI

// ===== 路径记录系统 =====
let pathLine = null;              // 路径线对象
let pathPoints = [];              // 路径点数组
let lastPathPoint = null;         // 上一个记录的路径点
let isRecordingPath = false;      // 路径记录状态（运行时为true，停止时为false）
const PATH_RECORD_INTERVAL = 0.3; // 路径记录间隔（单位：世界坐标距离）
const PATH_Y_OFFSET = 0.05;       // 路径线离地高度

// ===== 性能优化相关变量 =====
let needsRender = true; // 按需渲染标志
let lastCameraPosition = new THREE.Vector3();
let lastCameraRotation = new THREE.Euler();
let animationFrameId = null;
let fpsMonitor = {
    lastTime: performance.now(),
    frameCount: 0,
    fps: 60
};

// Chunk 系统基础架构（为未来扩展准备）
const ChunkManager = {
    chunkSize: 20, // 每个 Chunk 的大小
    loadedChunks: new Map(), // 已加载的 Chunk
    chunkGroup: null, // Chunk 容器组

    // 初始化 Chunk 系统
    init(scene) {
        this.chunkGroup = new THREE.Group();
        this.chunkGroup.name = 'ChunkGroup';
        scene.add(this.chunkGroup);
    },

    // 获取 Chunk 坐标
    getChunkCoord(x, z) {
        return {
            x: Math.floor(x / this.chunkSize),
            z: Math.floor(z / this.chunkSize)
        };
    },

    // 添加 Chunk（未来扩展用）
    addChunk(chunkX, chunkZ, mesh) {
        const key = `${chunkX}_${chunkZ}`;
        if (!this.loadedChunks.has(key)) {
            this.loadedChunks.set(key, mesh);
            if (this.chunkGroup) {
                this.chunkGroup.add(mesh);
            }
        }
    },

    // 移除 Chunk（未来扩展用）
    removeChunk(chunkX, chunkZ) {
        const key = `${chunkX}_${chunkZ}`;
        const chunk = this.loadedChunks.get(key);
        if (chunk && this.chunkGroup) {
            this.chunkGroup.remove(chunk);
            chunk.geometry?.dispose();
            chunk.material?.dispose();
            this.loadedChunks.delete(key);
        }
    }
};

// ===== 1. 初始化 Three.js 场景 =====
export function initScene(container) {
    // 创建场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // 天蓝色背景

    // 创建相机
    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    camera.position.copy(initialCameraPosition);
    camera.lookAt(initialCameraTarget);

    // 绑定默认渲染相机为轨道相机
    activeCamera = camera;
    cameraMode = 'orbit';

    // 创建绑定在小车前方的机位（先按世界坐标放在原点附近，等小车位置更新后再精确跟随）
    followCamera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    followCamera.position.set(0, 1.0, 2.0);
    followCamera.lookAt(0, 0.5, 5.0);

    // 初始化相机位置记录（用于按需渲染，只针对轨道相机）
    lastCameraPosition.copy(camera.position);
    lastCameraRotation.copy(camera.rotation);

    // 创建渲染器（性能优化）
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance" // 优先使用高性能 GPU
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 限制像素比，提升性能

    // 降低阴影质量以提升性能
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 使用软阴影，效果更好
    renderer.shadowMap.autoUpdate = true; // 启用自动更新，确保新生成的地形块有正确的阴影

    container.appendChild(renderer.domElement);

    // 初始化 Chunk 系统
    ChunkManager.init(scene);

    // 添加轨道控制器
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2; // 限制不能看到地面下方
    controls.minDistance = 5;
    controls.maxDistance = 50;
    controls.target.copy(initialCameraTarget); // 设置初始目标点

    // 添加光源
    addLights();

    // 创建地面
    createGround();

    // 初始化路径系统
    initPathSystem();

    // 加载小车模型
    loadCarModel();

    // 绑定键盘事件（自由视角用）
    keyDownHandler = (event) => handleFreeCameraKey(event, true);
    keyUpHandler = (event) => handleFreeCameraKey(event, false);
    window.addEventListener('keydown', keyDownHandler);
    window.addEventListener('keyup', keyUpHandler);

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

    // 降低阴影质量以提升性能（从 2048x2048 降至 512x512）
    directionalLight.shadow.mapSize.width = 512;
    directionalLight.shadow.mapSize.height = 512;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    directionalLight.shadow.bias = -0.0001; // 减少阴影瑕疵
    directionalLight.shadow.radius = 1; // 阴影模糊半径

    scene.add(directionalLight);
}

// ===== 3. 创建地面（40x40 网格，支持 Chunk 扩展） =====
function createGround() {
    // 删除原有的静态地面和网格，改为由 Chunk 系统管理
    // 初始加载原点附近的几个 chunk（-1到1范围，即3x3网格）
    for (let cx = -1; cx <= 1; cx++) {
        for (let cz = -1; cz <= 1; cz++) {
            const chunk = generateChunk(cx, cz);
            ChunkManager.addChunk(cx, cz, chunk);
        }
    }
    
    console.log('✓ 初始地面 Chunk 加载完成（3x3网格）');
}

// ===== 4. 路径记录系统 =====
function initPathSystem() {
    // 创建路径线的材质
    const pathMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,  // 白色
        linewidth: 2
    });
    
    // 创建初始的空几何体
    const pathGeometry = new THREE.BufferGeometry();
    
    // 创建路径线对象
    pathLine = new THREE.Line(pathGeometry, pathMaterial);
    pathLine.name = 'CarPathLine';
    pathLine.frustumCulled = false;  // 禁用视锥剔除，确保路径始终可见
    
    scene.add(pathLine);
    
    // 初始化路径点数组
    pathPoints = [];
    lastPathPoint = null;
    
    console.log('✓ 路径记录系统初始化完成');
}

// 记录路径点
function recordPathPoint(x, z) {
    // 如果路径记录器未开启，不记录
    if (!isRecordingPath) {
        return;
    }
    
    // 检查与上一个点的距离，避免记录过于密集的点
    if (lastPathPoint) {
        const dx = x - lastPathPoint.x;
        const dz = z - lastPathPoint.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance < PATH_RECORD_INTERVAL) {
            return; // 距离太近，不记录
        }
    }
    
    // 记录新的路径点
    const newPoint = new THREE.Vector3(x, PATH_Y_OFFSET, z);
    pathPoints.push(newPoint);
    lastPathPoint = { x, z };
    
    // 更新路径线几何体
    updatePathGeometry();
}

// 更新路径线几何体
function updatePathGeometry() {
    if (!pathLine || pathPoints.length < 2) return;
    
    // 创建新的几何体
    const newGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
    
    // 释放旧的几何体
    if (pathLine.geometry) {
        pathLine.geometry.dispose();
    }
    
    // 设置新的几何体
    pathLine.geometry = newGeometry;
    
    // 标记需要渲染
    needsRender = true;
}

// 清除路径
export function clearPath() {
    // 清空路径点数组
    pathPoints = [];
    lastPathPoint = null;
    
    // 重置路径线几何体
    if (pathLine && pathLine.geometry) {
        pathLine.geometry.dispose();
        pathLine.geometry = new THREE.BufferGeometry();
    }
    
    // 标记需要渲染
    needsRender = true;
    
    console.log('✓ 路径轨迹已清除');
}

// 开始记录路径
export function startPathRecording() {
    isRecordingPath = true;
    console.log('✓ 路径记录器已开启');
}

// 停止记录路径
export function stopPathRecording() {
    isRecordingPath = false;
    console.log('✓ 路径记录器已关闭');
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
            
            // 初始化插值位置（避免从0开始插值）
            carCurrentPosition.x = 0;
            carCurrentPosition.y = 0;
            carCurrentPosition.rotation = 0;
            carTargetPosition.x = 0;
            carTargetPosition.y = 0;
            carTargetPosition.rotation = 0;
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
    
    // 初始化插值位置（避免从0开始插值）
    carCurrentPosition.x = 0;
    carCurrentPosition.y = 0;
    carCurrentPosition.rotation = 0;
    carTargetPosition.x = 0;
    carTargetPosition.y = 0;
    carTargetPosition.rotation = 0;
    
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
    // 移除频繁的DEBUG日志以提升性能
    // console.log('[DEBUG] Received WebSocket message:', data);

    switch (type) {
        case 'position':
            updateCarPosition(data.x, data.y, data.rotation);
            // UI更新节流（避免频繁DOM操作影响性能）
            const now = performance.now();
            if (now - lastUIUpdateTime >= UI_UPDATE_INTERVAL) {
                if (data.x !== undefined && data.y !== undefined) {
                    const posXEl = document.getElementById('posX');
                    const posYEl = document.getElementById('posY');
                    if (posXEl) posXEl.textContent = data.x.toFixed(2);
                    if (posYEl) posYEl.textContent = data.y.toFixed(2);
                }
                lastUIUpdateTime = now;
            }
            break;

        case 'status':
            carState.speed = data.speed;
            carState.isMoving = data.isMoving;
            document.getElementById('speed').textContent = data.speed.toFixed(2);

            if (data.speed === 0 && !data.isMoving) {
                // 强制本地模型静止，防止残留动画
                if (carModel) {
                    // 直接同步到目标位置，跳过插值
                    carCurrentPosition.x = carState.position.x || 0;
                    carCurrentPosition.y = carState.position.y || 0;
                    carCurrentPosition.rotation = carState.rotation || 0;
                    carTargetPosition.x = carState.position.x || 0;
                    carTargetPosition.y = carState.position.y || 0;
                    carTargetPosition.rotation = carState.rotation || 0;
                    
                    // 确保角度在 0-360 范围内
                    while (carCurrentPosition.rotation < 0) carCurrentPosition.rotation += 360;
                    while (carCurrentPosition.rotation >= 360) carCurrentPosition.rotation -= 360;
                    
                    carModel.position.x = carCurrentPosition.x;
                    carModel.position.z = carCurrentPosition.y;
                    carModel.rotation.y = carCurrentPosition.rotation * Math.PI / 180;
                    
                    // 重置旋转更新时间
                    lastRotationUpdateTime = performance.now();
                }
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

// ===== 9. 更新小车位置（优化：使用插值平滑移动） =====
function updateCarPosition(x, y, rotation) {
    if (!carModel) {
        return;
    }
    
    // 更新目标位置（用于插值）
    carTargetPosition.x = x;
    carTargetPosition.y = y;
    
    // 处理旋转角度（确保在0-360范围内）
    let normalizedRotation = rotation;
    while (normalizedRotation < 0) normalizedRotation += 360;
    while (normalizedRotation >= 360) normalizedRotation -= 360;
    
    // 如果目标角度变化很大，可能是瞬间转向，需要确保插值能正常工作
    const oldTargetRot = carTargetPosition.rotation;
    carTargetPosition.rotation = normalizedRotation;
    
    // 如果当前角度和目标角度差距很大，确保当前角度也正确归一化
    while (carCurrentPosition.rotation < 0) carCurrentPosition.rotation += 360;
    while (carCurrentPosition.rotation >= 360) carCurrentPosition.rotation -= 360;
    
    // 更新内部状态
    carState.position.x = x;
    carState.position.y = y;
    carState.rotation = rotation;
}

// ===== 9.1. 平滑插值更新小车位置（在动画循环中调用） =====
function updateCarPositionSmooth() {
    if (!carModel) return;
    
    // 位置插值系数（15% 每帧，平衡响应速度和平滑度）
    const positionLerpFactor = 0.15;
    
    // 位置插值
    carCurrentPosition.x += (carTargetPosition.x - carCurrentPosition.x) * positionLerpFactor;
    carCurrentPosition.y += (carTargetPosition.y - carCurrentPosition.y) * positionLerpFactor;
    
    // 旋转插值（使用独立系数和速度限制，让转向更平滑）
    const currentTime = performance.now();
    let deltaTime = (currentTime - lastRotationUpdateTime) / 1000; // 转换为秒
    
    // 防止 deltaTime 为 0 或异常值
    if (deltaTime <= 0 || deltaTime > 0.1) {
        deltaTime = 0.016; // 默认约 60fps 的帧时间
    }
    
    lastRotationUpdateTime = currentTime;
    
    // 计算旋转差值（处理角度环绕）
    let rotDiff = carTargetPosition.rotation - carCurrentPosition.rotation;
    // 处理角度环绕（-180到180）
    if (rotDiff > 180) rotDiff -= 360;
    if (rotDiff < -180) rotDiff += 360;
    
    // 如果已经到达目标（差值很小），直接同步
    if (Math.abs(rotDiff) < 0.01) {
        carCurrentPosition.rotation = carTargetPosition.rotation;
    } else {
        // 根据角度差值动态调整旋转速度
        let targetRotSpeed;
        const absRotDiff = Math.abs(rotDiff);
        
        if (absRotDiff > 45) {
            // 大角度（>45度）：使用最大速度，快速转向
            targetRotSpeed = ROTATION_MAX_SPEED;
        } else if (absRotDiff < 2) {
            // 很小角度（<2度）：使用插值系数平滑过渡，避免抖动
            const lerpIncrement = rotDiff * ROTATION_LERP_FACTOR;
            carCurrentPosition.rotation += lerpIncrement;
            // 确保角度在 0-360 范围内
            while (carCurrentPosition.rotation < 0) carCurrentPosition.rotation += 360;
            while (carCurrentPosition.rotation >= 360) carCurrentPosition.rotation -= 360;
            // 直接返回，不继续执行下面的速度限制逻辑
            carModel.position.x = carCurrentPosition.x;
            carModel.position.z = carCurrentPosition.y;
            carModel.rotation.y = carCurrentPosition.rotation * Math.PI / 180;
            needsRender = true;
            return;
        } else {
            // 中等角度（2-45度）：在最小和最大速度之间线性插值
            const t = (absRotDiff - 2) / 43; // 0到1的插值系数
            targetRotSpeed = ROTATION_MIN_SPEED + (ROTATION_MAX_SPEED - ROTATION_MIN_SPEED) * t;
        }
        
        // 计算旋转增量（保持方向）
        const rotIncrement = Math.sign(rotDiff) * targetRotSpeed * deltaTime;
        
        // 如果插值增量超过目标差值，直接到达目标（避免过冲）
        if (Math.abs(rotIncrement) >= Math.abs(rotDiff)) {
            carCurrentPosition.rotation = carTargetPosition.rotation;
        } else {
            // 更新当前旋转角度
            carCurrentPosition.rotation += rotIncrement;
        }
    }
    
    // 确保角度在 0-360 范围内
    while (carCurrentPosition.rotation < 0) carCurrentPosition.rotation += 360;
    while (carCurrentPosition.rotation >= 360) carCurrentPosition.rotation -= 360;
    
    // Three.js 坐标系转换：
    // 后端: x=左右, y=前后
    // Three.js: x=左右, z=前后, y=上下
    carModel.position.x = carCurrentPosition.x;
    carModel.position.z = carCurrentPosition.y;
    carModel.rotation.y = carCurrentPosition.rotation * Math.PI / 180; // 转为弧度

    // 记录路径点（小车移动时）
    recordPathPoint(carCurrentPosition.x, carCurrentPosition.y);

    // 更新前方机位：放在车头稍微偏上，并看向车前方（优化：减少向量创建）
    if (followCamera && cameraMode === 'car_front') {
        // 复用向量对象，避免频繁创建
        if (!followCamera._cameraOffset) {
            followCamera._cameraOffset = new THREE.Vector3(0, 0.7, 1.2);
            followCamera._lookAtOffset = new THREE.Vector3(0, 0.4, 4.0);
            followCamera._worldCameraPos = new THREE.Vector3();
            followCamera._worldLookAtPos = new THREE.Vector3();
        }
        
        followCamera._worldCameraPos.copy(followCamera._cameraOffset);
        followCamera._worldLookAtPos.copy(followCamera._lookAtOffset);
        
        carModel.localToWorld(followCamera._worldCameraPos);
        carModel.localToWorld(followCamera._worldLookAtPos);
        
        followCamera.position.copy(followCamera._worldCameraPos);
        followCamera.lookAt(followCamera._worldLookAtPos);
    }

    // 标记需要渲染（按需渲染）
    needsRender = true;
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

// ===== 11. 渲染循环（按需渲染优化） =====
function animate() {
    animationFrameId = requestAnimationFrame(animate);

    // 平滑更新小车位置（插值）
    updateCarPositionSmooth();

    // 更新控制器
    let cameraChanged = false;
    if (controls) {
        controls.update();
    }

    // 自由视角键盘移动（仅在 orbit 模式下生效，不自动追车）
    if (cameraMode === 'orbit' && activeCamera === camera) {
        const freeCamMoving =
            freeCamKeyState.ArrowUp || freeCamKeyState.KeyW ||
            freeCamKeyState.ArrowDown || freeCamKeyState.KeyS ||
            freeCamKeyState.ArrowLeft || freeCamKeyState.KeyA ||
            freeCamKeyState.ArrowRight || freeCamKeyState.KeyD;

        if (freeCamMoving && camera) {
            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward);
            forward.y = 0; // 保持水平移动
            if (forward.lengthSq() > 0) {
                forward.normalize();
            }

            const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

            const move = new THREE.Vector3();

            if (freeCamKeyState.ArrowUp) {
                move.add(forward);
            }
            if (freeCamKeyState.ArrowDown) {
                move.sub(forward);
            }
            if (freeCamKeyState.ArrowRight) {
                move.add(right);
            }
            if (freeCamKeyState.ArrowLeft) {
                move.sub(right);
            }

            if (move.lengthSq() > 0) {
                move.normalize().multiplyScalar(FREE_CAM_MOVE_SPEED);

                // 飞行模式：相机整体平移，而不是绕世界中心转圈
                camera.position.add(move);
                if (controls) {
                    // 让 OrbitControls 的焦点跟着一起平移，避免围绕原来的中心旋转
                    controls.target.add(move);
                }
                cameraChanged = true;
            }
        }
    }

    // 检查相机是否移动（用于按需渲染）
    if (camera) {
        const currentPos = camera.position.clone();
        const currentRot = camera.rotation.clone();

        // 使用阈值比较，避免浮点数精度问题
        const posThreshold = 0.001;
        const rotThreshold = 0.001;

        if (currentPos.distanceTo(lastCameraPosition) > posThreshold ||
            Math.abs(currentRot.x - lastCameraRotation.x) > rotThreshold ||
            Math.abs(currentRot.y - lastCameraRotation.y) > rotThreshold ||
            Math.abs(currentRot.z - lastCameraRotation.z) > rotThreshold) {
            cameraChanged = true;
            lastCameraPosition.copy(currentPos);
            lastCameraRotation.copy(currentRot);
        }
    }

    // 按需渲染：只在场景变化时渲染
    if (needsRender || cameraChanged) {
        // 更新 FPS 监控
        updateFPS();

        // 渲染场景
        const renderCamera = activeCamera || camera;
        if (renderer && scene && renderCamera) {
            renderer.render(scene, renderCamera);
        }

        // 仅在需要时更新阴影（降低 GPU 压力）
        if (needsRender && renderer.shadowMap.enabled) {
            renderer.shadowMap.needsUpdate = true;
        }

        needsRender = false;
    }
}

// ===== FPS 监控和性能统计 =====
function updateFPS() {
    const currentTime = performance.now();
    fpsMonitor.frameCount++;

    if (currentTime >= fpsMonitor.lastTime + 1000) {
        fpsMonitor.fps = fpsMonitor.frameCount;
        fpsMonitor.frameCount = 0;
        fpsMonitor.lastTime = currentTime;

        // 如果 FPS 过低，自动降低渲染质量
        if (fpsMonitor.fps < 30) {
            console.warn(`FPS 较低: ${fpsMonitor.fps}，考虑降低渲染质量`);
            // 可以在这里添加自适应降级逻辑
        }
    }
}

// ===== 自由视角键盘控制处理 =====
function handleFreeCameraKey(event, isDown) {
    const code = event.code;

    if (code in freeCamKeyState) {
        freeCamKeyState[code] = isDown;

        // 防止页面滚动等默认行为（仅针对方向键）
        if (code.startsWith('Arrow')) {
            event.preventDefault();
        }

        // 有键按下/抬起时请求一次渲染
        needsRender = true;
    }
}

// 导出 FPS 信息（用于 UI 显示）
export function getFPS() {
    return fpsMonitor.fps;
}

// ===== 12. 窗口自适应 =====
function onWindowResize() {
    const container = renderer.domElement.parentElement;
    if (!container) return;

    const aspect = container.clientWidth / container.clientHeight;

    if (camera) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
    }

    if (followCamera) {
        followCamera.aspect = aspect;
        followCamera.updateProjectionMatrix();
    }

    renderer.setSize(container.clientWidth, container.clientHeight);

    // 窗口大小变化时需要重新渲染
    needsRender = true;
}


// ===== 14. 清理资源 =====
export function dispose() {
    // 取消动画循环
    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    // 清理 Chunk 系统
    if (ChunkManager.chunkGroup) {
        ChunkManager.loadedChunks.forEach((chunk, key) => {
            if (chunk.geometry) chunk.geometry.dispose();
            if (chunk.material) chunk.material.dispose();
        });
        ChunkManager.loadedChunks.clear();
        if (scene && ChunkManager.chunkGroup) {
            scene.remove(ChunkManager.chunkGroup);
        }
    }

    if (keyDownHandler) {
        window.removeEventListener('keydown', keyDownHandler);
        keyDownHandler = null;
    }
    if (keyUpHandler) {
        window.removeEventListener('keyup', keyUpHandler);
        keyUpHandler = null;
    }

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

// ===== 15. 强制渲染（用于外部调用） =====
export function requestRender() {
    needsRender = true;
}

// ===== 16. 相机模式切换（暴露给前端下拉框） =====
export function setCameraMode(mode) {
    if (mode !== 'orbit' && mode !== 'car_front') {
        console.warn('未知相机模式:', mode);
        return;
    }

    cameraMode = mode;

    if (mode === 'orbit') {
        activeCamera = camera || activeCamera;
        if (controls) {
            controls.enabled = true;
        }
    } else if (mode === 'car_front') {
        activeCamera = followCamera || camera || activeCamera;
        if (controls) {
            controls.enabled = false;
        }
    }

    // 切换相机后立即刷新一帧
    needsRender = true;
}

// ===== 17. 获取当前状态 =====
export function getCarState() {
    return { ...carState };
}

export function isWebSocketConnected() {
    return isConnected;
}

// ===== 18. 重置自由视角相机到初始位置 =====
export function resetFreeCamera() {
    if (!camera || !controls) {
        console.warn('相机或控制器未初始化，无法重置');
        return;
    }

    // 重置相机位置
    camera.position.copy(initialCameraPosition);
    
    // 重置 OrbitControls 的目标点
    controls.target.copy(initialCameraTarget);
    
    // 更新控制器（确保阻尼等效果正确应用）
    controls.update();
    
    // 更新相机朝向
    camera.lookAt(initialCameraTarget);
    
    // 更新位置记录（用于按需渲染）
    lastCameraPosition.copy(camera.position);
    lastCameraRotation.copy(camera.rotation);
    
    // 清除路径轨迹
    clearPath();
    
    // 标记需要渲染
    needsRender = true;
    
    console.log('✓ 自由视角相机已重置到初始位置');
}

// ---- Chunk 配置 -------------------------------------------------------
const CHUNK_CONFIG = {
  SIZE: ChunkManager.chunkSize || 20,
  RANGE: 2, // 1 = 3x3 chunks, 2 = 5x5 chunks
  ENABLE_DEBUG: false
}

// ---- Chunk 内容生成器 ----
function generateChunk(cx, cz) {
  const group = new THREE.Group()
  group.position.set(cx * CHUNK_CONFIG.SIZE, 0, cz * CHUNK_CONFIG.SIZE)

  // 地面
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(CHUNK_CONFIG.SIZE, CHUNK_CONFIG.SIZE),
    new THREE.MeshStandardMaterial({
      color: ((cx + cz) % 2 === 0) ? 0x6fa36f : 0x5c8c5c
    })
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true  // 接收阴影
  floor.castShadow = false    // 地面一般不投射阴影到其他物体
  group.add(floor)

  // 示例障碍物（不影响小车逻辑，仅视觉）
  const obstacleCount = Math.abs((cx * 92821 + cz * 68917) % 4)

  for (let i = 0; i < obstacleCount; i++) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x666666 })
    )
    box.position.set(
      (Math.random() - 0.5) * CHUNK_CONFIG.SIZE * 0.7,
      0.5,
      (Math.random() - 0.5) * CHUNK_CONFIG.SIZE * 0.7
    )
    box.castShadow = true    // 障碍物可以投射阴影
    box.receiveShadow = true // 障碍物也可以接收阴影
    group.add(box)
  }

  return group
}

// ---- Chunk 自动加载与卸载 ----
function updateChunksByCarPosition() {
  if (!carModel || !ChunkManager) return

  const x = carModel.position.x
  const z = carModel.position.z

  const { x: cx, z: cz } = ChunkManager.getChunkCoord(x, z)

  const needed = new Set()

  for (let dx = -CHUNK_CONFIG.RANGE; dx <= CHUNK_CONFIG.RANGE; dx++) {
    for (let dz = -CHUNK_CONFIG.RANGE; dz <= CHUNK_CONFIG.RANGE; dz++) {
      const nx = cx + dx
      const nz = cz + dz
      const key = `${nx}_${nz}`

      needed.add(key)

      if (!ChunkManager.loadedChunks.has(key)) {
        const chunk = generateChunk(nx, nz)
        ChunkManager.addChunk(nx, nz, chunk)

        if (CHUNK_CONFIG.ENABLE_DEBUG) {
          console.log('Chunk loaded:', key)
        }
      }
    }
  }

  // 卸载不需要的 chunk
  ChunkManager.loadedChunks.forEach((_, key) => {
    if (!needed.has(key)) {
      const [x, z] = key.split('_').map(Number)
      ChunkManager.removeChunk(x, z)

      if (CHUNK_CONFIG.ENABLE_DEBUG) {
        console.log('Chunk unloaded:', key)
      }
    }
  })
}

// ---- Hook 到你的主动画循环（不替换、不覆盖） ----
(function hookChunkUpdater() {
  const originalAnimate = window.animate

  // 如果你已有 animate()，我们不覆盖，只“并行补丁”
  if (typeof originalAnimate === 'function') {
    window.animate = function () {
      updateChunksByCarPosition()
      originalAnimate()
    }
  } else {
    // 如果没有 animate，全局挂载一个最小循环（只负责 chunk）
    function fallbackLoop() {
      requestAnimationFrame(fallbackLoop)
      updateChunksByCarPosition()
    }
    fallbackLoop()
  }
})()

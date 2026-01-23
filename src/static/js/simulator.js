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
    camera.position.set(15, 12, 15);
    camera.lookAt(0, 0, 0);
    
    // 初始化相机位置记录（用于按需渲染）
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
    renderer.shadowMap.type = THREE.BasicShadowMap; // 从 PCFSoftShadowMap 改为 BasicShadowMap，降低 GPU 压力
    renderer.shadowMap.autoUpdate = false; // 禁用自动更新，手动控制阴影更新
    
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
    directionalLight.shadow.radius = 2; // 阴影模糊半径（BasicShadowMap 下影响较小）
    
    scene.add(directionalLight);
}

// ===== 3. 创建地面（40x40 网格，支持 Chunk 扩展） =====
function createGround() {
    // 地面网格（降低细分以提升性能）
    const gridHelper = new THREE.GridHelper(40, 20, 0x888888, 0xcccccc); // 从 40 格降至 20 格
    scene.add(gridHelper);

    // 地面平面（接收阴影）- 使用 Chunk 系统管理
    const groundGeometry = new THREE.PlaneGeometry(40, 40);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x228b22,
        roughness: 0.8,
        metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'Ground';
    
    // 将地面添加到 Chunk 系统（当前为单个 Chunk，未来可扩展为多个）
    const chunkCoord = ChunkManager.getChunkCoord(0, 0);
    ChunkManager.addChunk(chunkCoord.x, chunkCoord.z, ground);
    
    scene.add(ground);
}

// ===== 4. 创建黑线路径（循线轨道，优化 draw call） =====
function drawLinePath() {
    // 合并所有路径点到一个几何体，减少 draw call
    const allPoints = [];
    
    // 直线路径，从 (0, 0, -15) 到 (0, 0, 15)
    for (let z = -15; z <= 15; z += 0.5) {
        allPoints.push(new THREE.Vector3(0, 0.02, z));
    }

    // 转弯路径
    for (let x = 0; x <= 10; x += 0.5) {
        allPoints.push(new THREE.Vector3(x, 0.02, 15));
    }

    // 使用单个几何体和材质，减少 draw call
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(allPoints);
    const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0x000000, 
        linewidth: 3 
    });
    
    // 如果路径是连续的，使用 Line；如果需要分段，使用 LineSegments
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.name = 'PathLine';
    scene.add(line);
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
    
    // 标记需要渲染（按需渲染）
    needsRender = true;
    
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

// ===== 11. 渲染循环（按需渲染优化） =====
function animate() {
    animationFrameId = requestAnimationFrame(animate);
    
    // 更新控制器
    let cameraChanged = false;
    if (controls) {
        controls.update();
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
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
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

// 导出 FPS 信息（用于 UI 显示）
export function getFPS() {
    return fpsMonitor.fps;
}

// ===== 12. 窗口自适应 =====
function onWindowResize() {
    const container = renderer.domElement.parentElement;
    if (!container) return;

    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
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

// ===== 15. 获取当前状态 =====
export function getCarState() {
    return { ...carState };
}

export function isWebSocketConnected() {
    return isConnected;
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
  floor.receiveShadow = true
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
    box.castShadow = true
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

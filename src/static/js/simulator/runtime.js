/**
 * simulator/runtime.js
 * 全局状态容器（唯一 source of truth）
 * 只存数据/引用，不写业务逻辑
 */

import * as THREE from 'three';

// ===== Three.js 核心对象 =====
export let scene = null;
export let renderer = null;
export let controls = null;
export let camera = null;           // orbit 相机
export let followCamera = null;     // 车前相机
export let activeCamera = null;

// ===== 相机模式 & 初始值 =====
export let cameraMode = 'orbit';    // 'orbit' | 'car_front'
export const initialCameraPosition = new THREE.Vector3(15, 12, 15);
export const initialCameraTarget = new THREE.Vector3(0, 0, 0);

// ===== 小车模型 =====
export let carModel = null;

// ===== WebSocket =====
export let socket = null;
export let isConnected = false;

// ===== 渲染与性能 =====
export let needsRender = true;
export let animationFrameId = null;
export const fpsMonitor = {
    lastTime: performance.now(),
    frameCount: 0,
    fps: 60
};
export const lastCameraPosition = new THREE.Vector3();
export const lastCameraRotation = new THREE.Euler();

// ===== 自由视角输入 =====
export const freeCamKeyState = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
};
export let keyDownHandler = null;
export let keyUpHandler = null;

// ===== Chunk 系统 =====
export let ChunkManagerRef = null;

// ===== 路径系统 =====
export let pathLine = null;
export let pathPoints = [];
export let lastPathPoint = null;
export let isRecordingPath = false;

// ===== 常量配置 =====
export const FREE_CAM_MOVE_SPEED = 0.2;
export const UI_UPDATE_INTERVAL = 100;
export const PATH_RECORD_INTERVAL = 0.3;
export const PATH_Y_OFFSET = 0.05;

// ===== Setter 函数（用于跨模块修改 let 变量） =====
export function setScene(val) { scene = val; }
export function setRenderer(val) { renderer = val; }
export function setControls(val) { controls = val; }
export function setCamera(val) { camera = val; }
export function setFollowCamera(val) { followCamera = val; }
export function setActiveCamera(val) { activeCamera = val; }
export function setCameraModeValue(val) { cameraMode = val; }
export function setCarModel(val) { carModel = val; }
export function setSocket(val) { socket = val; }
export function setIsConnected(val) { isConnected = val; }
export function setNeedsRender(val) { needsRender = val; }
export function setAnimationFrameId(val) { animationFrameId = val; }
export function setKeyDownHandler(val) { keyDownHandler = val; }
export function setKeyUpHandler(val) { keyUpHandler = val; }
export function setChunkManagerRef(val) { ChunkManagerRef = val; }
export function setPathLine(val) { pathLine = val; }
export function setPathPoints(val) { pathPoints = val; }
export function setLastPathPoint(val) { lastPathPoint = val; }
export function setIsRecordingPath(val) { isRecordingPath = val; }

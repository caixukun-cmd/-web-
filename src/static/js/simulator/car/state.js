/**
 * simulator/car/state.js
 * 小车状态与插值参数（模块私有，不放 runtime）
 */

// ===== 旋转插值配置 =====
export const ROTATION_LERP_FACTOR = 0.2;
export const ROTATION_MAX_SPEED = 360;
export const ROTATION_MIN_SPEED = 90;

// ===== 小车状态 =====
export const carState = {
    position: { x: 0, y: 0 },
    rotation: 0,
    speed: 0,
    isMoving: false
};

// ===== 插值目标与当前位置 =====
export const carTargetPosition = { x: 0, y: 0, rotation: 0 };
export const carCurrentPosition = { x: 0, y: 0, rotation: 0 };

// ===== 旋转更新时间 =====
export let lastRotationUpdateTime = performance.now();
export function setLastRotationUpdateTime(val) { lastRotationUpdateTime = val; }

// ===== 初始化小车状态 =====
export function initCarState() {
    carCurrentPosition.x = 0;
    carCurrentPosition.y = 0;
    carCurrentPosition.rotation = 0;
    carTargetPosition.x = 0;
    carTargetPosition.y = 0;
    carTargetPosition.rotation = 0;
    lastRotationUpdateTime = performance.now();
}

// ===== 获取小车状态 =====
export function getCarState() {
    return { ...carState };
}

// ===== 更新小车运动状态 =====
export function setCarStatus(speed, isMoving) {
    carState.speed = speed;
    carState.isMoving = isMoving;
}

/**
 * simulator/car/control/pidController.js
 * PID 控制器模块
 * 
 * 功能：
 * - 可调参数：Kp / Ki / Kd
 * - 输入误差，输出控制量
 * - 支持积分限幅、微分滤波
 */
// ===== PID 参数配置 =====
const DEFAULT_PID_CONFIG = {
    Kp: 1.0,           // 比例系数
    Ki: 0.0,           // 积分系数
    Kd: 0.1,           // 微分系数
    maxIntegral: 1.0,  // 积分限幅
    maxOutput: 1.0,    // 输出限幅
    deadZone: 0.02,    // 死区（误差小于此值时输出为 0）
    derivativeFilter: 0.2  // 微分滤波系数 (0-1)，越小滤波越强
};

let pidConfig = { ...DEFAULT_PID_CONFIG };

// ===== PID 状态 =====
let integral = 0;           // 积分累积
let lastError = 0;          // 上次误差
let lastDerivative = 0;     // 上次微分值（用于滤波）
let lastUpdateTime = 0;     // 上次更新时间

// ===== 初始化 PID 控制器 =====
export function initPID(config = {}) {
    pidConfig = { ...DEFAULT_PID_CONFIG, ...config };
    resetPID();
    console.log(`✓ PID 控制器初始化: Kp=${pidConfig.Kp}, Ki=${pidConfig.Ki}, Kd=${pidConfig.Kd}`);
}

// ===== 重置 PID 状态 =====
export function resetPID() {
    integral = 0;
    lastError = 0;
    lastDerivative = 0;
    lastUpdateTime = performance.now();
}

// ===== 计算 PID 输出 =====
export function computePID(error, deltaTime = null) {
    const currentTime = performance.now();
    
    // 计算时间差
    let dt = deltaTime;
    if (dt === null) {
        dt = (currentTime - lastUpdateTime) / 1000; // 转为秒
        if (dt <= 0 || dt > 0.1) {
            dt = 0.016; // 默认约 60fps
        }
    }
    lastUpdateTime = currentTime;
    
    // 死区处理
    if (Math.abs(error) < pidConfig.deadZone) {
        error = 0;
    }
    
    // ===== P (比例) =====
    const proportional = pidConfig.Kp * error;
    
    // ===== I (积分) =====
    integral += error * dt;
    // 积分限幅
    integral = clamp(integral, -pidConfig.maxIntegral, pidConfig.maxIntegral);
    // 积分抗饱和：如果误差符号改变，清除积分
    if (error * lastError < 0) {
        integral = 0;
    }
    const integralTerm = pidConfig.Ki * integral;
    
    // ===== D (微分) =====
    let derivative = 0;
    if (dt > 0) {
        const rawDerivative = (error - lastError) / dt;
        // 微分滤波（低通滤波）
        derivative = lastDerivative + pidConfig.derivativeFilter * (rawDerivative - lastDerivative);
        lastDerivative = derivative;
    }
    const derivativeTerm = pidConfig.Kd * derivative;
    
    // 保存当前误差
    lastError = error;
    
    // ===== 计算总输出 =====
    let output = proportional + integralTerm + derivativeTerm;
    
    // 输出限幅
    output = clamp(output, -pidConfig.maxOutput, pidConfig.maxOutput);
    
    return {
        output,
        proportional,
        integral: integralTerm,
        derivative: derivativeTerm,
        error
    };
}

// ===== 简化版 PID（只返回输出值） =====
export function compute(error) {
    return computePID(error).output;
}

// ===== 限幅函数 =====
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// ===== 获取 PID 配置 =====
export function getPIDConfig() {
    return { ...pidConfig };
}

// ===== 设置 Kp =====
export function setKp(value) {
    pidConfig.Kp = Math.max(0, value);
}

// ===== 设置 Ki =====
export function setKi(value) {
    pidConfig.Ki = Math.max(0, value);
    // Ki 改变时清除积分
    integral = 0;
}

// ===== 设置 Kd =====
export function setKd(value) {
    pidConfig.Kd = Math.max(0, value);
}

// ===== 设置所有 PID 参数 =====
export function setPIDParams(Kp, Ki, Kd) {
    if (Kp !== undefined) pidConfig.Kp = Math.max(0, Kp);
    if (Ki !== undefined) {
        pidConfig.Ki = Math.max(0, Ki);
        integral = 0;
    }
    if (Kd !== undefined) pidConfig.Kd = Math.max(0, Kd);
}

// ===== 设置输出限幅 =====
export function setMaxOutput(value) {
    pidConfig.maxOutput = Math.max(0.1, value);
}

// ===== 设置死区 =====
export function setDeadZone(value) {
    pidConfig.deadZone = Math.max(0, Math.min(0.5, value));
}

// ===== 获取 PID 状态（用于调试） =====
export function getPIDState() {
    return {
        integral,
        lastError,
        lastDerivative,
        config: { ...pidConfig }
    };
}

/**
 * simulator/car/sync.js
 * 处理 WebSocket position 消息，更新小车目标位置
 */

import * as runtime from '../runtime.js';
import { carState, carTargetPosition, carCurrentPosition } from './state.js';

export function updateCarPosition(x, y, rotation) {
    if (!runtime.carModel) {
        return;
    }
    
    // 更新目标位置（用于插值）
    carTargetPosition.x = x;
    carTargetPosition.y = y;
    
    // 处理旋转角度（确保在0-360范围内）
    let normalizedRotation = rotation;
    while (normalizedRotation < 0) normalizedRotation += 360;
    while (normalizedRotation >= 360) normalizedRotation -= 360;
    
    carTargetPosition.rotation = normalizedRotation;
    
    // 如果当前角度和目标角度差距很大，确保当前角度也正确归一化
    while (carCurrentPosition.rotation < 0) carCurrentPosition.rotation += 360;
    while (carCurrentPosition.rotation >= 360) carCurrentPosition.rotation -= 360;
    
    // 更新内部状态
    carState.position.x = x;
    carState.position.y = y;
    carState.rotation = rotation;
}

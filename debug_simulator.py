"""
调试模拟器位置更新逻辑
"""
from utils import VirtualCar

def test_movement():
    print("=== 测试小车移动逻辑 ===")
    
    # 创建小车实例
    car = VirtualCar()
    
    print(f"初始位置: x={car.x}, y={car.y}, rotation={car.rotation}")
    print(f"初始速度: speed={car.speed}, desired_speed={car.desired_speed}")
    print(f"初始运动状态: is_moving={car.is_moving}")
    print(f"初始活动运动状态: has_active_motion={car.has_active_motion()}")
    print()
    
    # 执行前进命令
    print("执行: car.forward(50, 3.0) - 速度50，持续3秒")
    car.forward(50, 3.0)
    print(f"前进后位置: x={car.x}, y={car.y}, rotation={car.rotation}")
    print(f"前进后速度: speed={car.speed}, desired_speed={car.desired_speed}")
    print(f"前进后运动状态: is_moving={car.is_moving}")
    print(f"前进后活动运动状态: has_active_motion={car.has_active_motion()}")
    print()
    
    # 模拟时间流逝并更新位置
    print("模拟时间流逝并更新位置...")
    for i in range(60):  # 增加迭代次数以覆盖3秒的运动
        # 模拟delta_time = 0.05秒（与仿真器相同）
        delta_time = 0.05
        car.update_position(delta_time)
        
        print(f"第{i+1}次更新 - 位置: x={car.x:.2f}, y={car.y:.2f}, rotation={car.rotation}")
        print(f"第{i+1}次更新 - 速度: speed={car.speed}, desired_speed={car.desired_speed}")
        print(f"第{i+1}次更新 - 运动状态: is_moving={car.is_moving}")
        print(f"第{i+1}次更新 - 活动运动状态: has_active_motion={car.has_active_motion()}")
        print()
        
        # 检查是否已停止
        if not car.has_active_motion():
            print("小车已停止运动")
            break
    
    # 执行转向命令
    print("执行: car.turn_right(90)")
    car.turn_right(90)
    print(f"转向后位置: x={car.x:.2f}, y={car.y:.2f}, rotation={car.rotation}")
    print(f"转向后速度: speed={car.speed}, desired_speed={car.desired_speed}")
    print(f"转向后运动状态: is_moving={car.is_moving}")
    print(f"转向后活动运动状态: has_active_motion={car.has_active_motion()}")
    print()
    
    # 再次更新位置（应该不会继续移动，因为运动已经结束）
    print("转向后再更新位置...")
    for i in range(5):
        delta_time = 0.05
        car.update_position(delta_time)
        
        print(f"转向后第{i+1}次更新 - 位置: x={car.x:.2f}, y={car.y:.2f}, rotation={car.rotation}")
        print(f"转向后第{i+1}次更新 - 速度: speed={car.speed}, desired_speed={car.desired_speed}")
        print(f"转向后第{i+1}次更新 - 运动状态: is_moving={car.is_moving}")
        print(f"转向后第{i+1}次更新 - 活动运动状态: has_active_motion={car.has_active_motion()}")
        print()

if __name__ == "__main__":
    test_movement()
"""
WebSocket连接测试脚本 - 使用安全API
"""
import asyncio
import websockets
import json


async def test_websocket():
    """测试WebSocket连接"""
    uri = "ws://localhost:8000/ws"
    
    print(f"正在连接到 {uri}...")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✓ WebSocket 连接成功!")
            
            # 接收欢迎消息
            message = await websocket.recv()
            data = json.loads(message)
            print(f"收到欢迎消息: {data.get('message', data)}")
            
            # 接收几条初始状态消息
            print("\n接收初始状态...")
            for i in range(3):
                message = await websocket.recv()
                data = json.loads(message)
                if data.get('type') in ['position', 'status']:
                    print(f"  {data.get('type')}: {data}")
            
            # 测试1: 简单的打印
            print("\n【测试1】简单打印")
            await websocket.send(json.dumps({
                'type': 'run_code',
                'code': 'print("Hello, Car Simulator!")'
            }))
            
            await asyncio.sleep(1)
            
            # 测试2: 小车移动（使用安全的time API）
            print("\n【测试2】小车移动测试")
            test_code = """
print("开始移动测试...")
car.forward(50)
print("小车前进中...")
"""
            
            await websocket.send(json.dumps({
                'type': 'run_code',
                'code': test_code
            }))
            
            # 接收执行结果
            print("接收执行日志:")
            received_logs = 0
            for i in range(15):
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                    data = json.loads(message)
                    msg_type = data.get('type')
                    
                    if msg_type == 'log':
                        print(f"  [日志] {data.get('message')}")
                        received_logs += 1
                    elif msg_type == 'error':
                        print(f"  [错误] {data.get('message')}")
                    elif msg_type == 'complete':
                        print(f"  [完成] {data.get('message')}")
                        break
                    elif msg_type == 'position':
                        x, y, rot = data.get('x'), data.get('y'), data.get('rotation')
                        if x != 0 or y != 0:  # 只显示有变化的位置
                            print(f"  [位置] x={x:.2f}, y={y:.2f}, rotation={rot:.2f}°")
                except asyncio.TimeoutError:
                    if received_logs > 0:
                        break
            
            # 等待一段时间观察小车移动
            print("\n观察小车移动...")
            await asyncio.sleep(2)
            
            # 停止小车
            print("\n【测试3】停止小车")
            await websocket.send(json.dumps({
                'type': 'stop'
            }))
            await asyncio.sleep(0.5)
            
            # 重置小车
            print("\n【测试4】重置小车")
            await websocket.send(json.dumps({'type': 'reset'}))
            
            # 接收重置确认
            for i in range(3):
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                    data = json.loads(message)
                    if data.get('type') == 'log':
                        print(f"  {data.get('message')}")
                    elif data.get('type') == 'position':
                        print(f"  位置已重置: x={data.get('x')}, y={data.get('y')}")
                except asyncio.TimeoutError:
                    break
            
            print("\n" + "=" * 50)
            print("✓ 所有测试完成!")
            print("=" * 50)
            
    except Exception as e:
        print(f"✗ 错误: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    print("=" * 50)
    print("WebSocket 功能测试")
    print("=" * 50)
    asyncio.run(test_websocket())

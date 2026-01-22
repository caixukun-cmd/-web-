"""
WebSocket连接测试脚本
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
            print(f"收到消息: {data}")
            
            # 接收几条状态消息
            print("\n接收状态更新...")
            for i in range(5):
                message = await websocket.recv()
                data = json.loads(message)
                print(f"[{i+1}] {data.get('type')}: {data}")
            
            # 发送测试代码
            print("\n发送测试代码...")
            test_code = """
print("Hello from car simulator!")
car.forward(50)
import time
time.sleep(1)
car.stop()
print("Test completed!")
"""
            
            await websocket.send(json.dumps({
                'type': 'run_code',
                'code': test_code
            }))
            print("✓ 代码已发送")
            
            # 接收执行结果
            print("\n接收执行结果...")
            for i in range(10):
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                    data = json.loads(message)
                    msg_type = data.get('type')
                    
                    if msg_type == 'log':
                        print(f"[日志] {data.get('message')}")
                    elif msg_type == 'error':
                        print(f"[错误] {data.get('message')}")
                    elif msg_type == 'complete':
                        print(f"[完成] {data.get('message')}")
                        break
                    elif msg_type == 'position':
                        print(f"[位置] x={data.get('x')}, y={data.get('y')}, rotation={data.get('rotation')}")
                except asyncio.TimeoutError:
                    print("等待超时")
                    break
            
            # 重置小车
            print("\n重置小车...")
            await websocket.send(json.dumps({'type': 'reset'}))
            
            # 接收重置确认
            for i in range(3):
                message = await websocket.recv()
                data = json.loads(message)
                if data.get('type') == 'log':
                    print(f"[日志] {data.get('message')}")
            
            print("\n✓ 测试完成!")
            
    except Exception as e:
        print(f"✗ 错误: {e}")


if __name__ == "__main__":
    print("=" * 50)
    print("WebSocket 连接测试")
    print("=" * 50)
    asyncio.run(test_websocket())

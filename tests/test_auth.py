"""
测试认证功能
"""
import requests
import json

API_BASE_URL = "http://localhost:8000"

def test_login(username, password):
    """测试登录"""
    print(f"\n{'='*50}")
    print(f"测试登录: {username}")
    print(f"{'='*50}")
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/auth/login",
            json={"username": username, "password": password},
            headers={"Content-Type": "application/json"}
        )
        
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("✓ 登录成功!")
            print(f"Token: {data['access_token'][:50]}...")
            print(f"用户信息: {json.dumps(data['user'], ensure_ascii=False, indent=2)}")
            return data['access_token']
        else:
            print(f"✗ 登录失败: {response.json()}")
            return None
            
    except Exception as e:
        print(f"✗ 请求失败: {str(e)}")
        return None

def test_get_current_user(token):
    """测试获取当前用户信息"""
    print(f"\n{'='*50}")
    print("测试获取当前用户信息")
    print(f"{'='*50}")
    
    try:
        response = requests.get(
            f"{API_BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("✓ 获取用户信息成功!")
            print(f"用户信息: {json.dumps(data, ensure_ascii=False, indent=2)}")
        else:
            print(f"✗ 获取失败: {response.json()}")
            
    except Exception as e:
        print(f"✗ 请求失败: {str(e)}")

def main():
    print("\n" + "="*50)
    print("智能小车模拟仿真系统 - 认证功能测试")
    print("="*50)
    
    # 测试用户1登录
    token1 = test_login("student001", "pass123456")
    if token1:
        test_get_current_user(token1)
    
    # 测试用户2登录
    token2 = test_login("teacher_zhang", "teach2024")
    if token2:
        test_get_current_user(token2)
    
    # 测试错误密码
    test_login("student001", "wrongpassword")
    
    # 测试不存在的用户
    test_login("nonexistent", "password")
    
    print("\n" + "="*50)
    print("测试完成!")
    print("="*50 + "\n")

if __name__ == "__main__":
    main()

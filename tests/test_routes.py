"""
测试所有路由
"""
import requests

BASE_URL = "http://localhost:8000"

routes_to_test = [
    "/",
    "/health",
    "/login.html",
    "/register.html",
    "/dashboard.html",
    "/test_connection.html",
]

print("=" * 60)
print("路由测试")
print("=" * 60)

for route in routes_to_test:
    url = BASE_URL + route
    try:
        response = requests.get(url, timeout=5)
        status = "✓ 成功" if response.status_code == 200 else f"✗ 失败 ({response.status_code})"
        content_type = response.headers.get('content-type', 'N/A')
        size = len(response.content)
        
        print(f"\n{route:30} {status}")
        print(f"  Content-Type: {content_type}")
        print(f"  Size: {size} bytes")
        
    except Exception as e:
        print(f"\n{route:30} ✗ 错误: {str(e)}")

print("\n" + "=" * 60)

@echo off
chcp 65001 >nul
echo ====================================
echo 智能小车模拟仿真系统 - 启动测试
echo ====================================
echo.

echo [1] 检查服务是否运行...
netstat -ano | findstr ":8000" >nul
if %errorlevel% equ 0 (
    echo ✓ 后端服务正在运行
) else (
    echo ✗ 后端服务未运行
    echo.
    echo 请先启动后端服务：
    echo   uvicorn main:app --reload --host 0.0.0.0 --port 8000
    echo.
    pause
    exit /b 1
)

echo.
echo [2] 打开测试页面...
start http://localhost:8000/test_connection.html

echo.
echo [3] 可用的测试账号：
echo   学生账号: student001 / pass123456
echo   教师账号: teacher_zhang / teach2024
echo.

echo [4] 可访问的页面：
echo   首页:     http://localhost:8000/
echo   登录页:   http://localhost:8000/login.html
echo   注册页:   http://localhost:8000/register.html
echo   主页:     http://localhost:8000/dashboard.html
echo   测试页:   http://localhost:8000/test_connection.html
echo   API文档:  http://localhost:8000/docs
echo.

echo ✓ 测试页面已在浏览器中打开
echo.
pause

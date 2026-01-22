@echo off
echo ========================================
echo WebSocket 测试页面启动器
echo ========================================
echo.
echo 正在打开 WebSocket 测试页面...
echo 服务器地址: http://localhost:8000
echo.

REM 打开 WebSocket 测试页面
start http://localhost:8000/test_websocket.html

REM 打开仿真页面（如果已登录）
timeout /t 2 /nobreak >nul
start http://localhost:8000/simulator.html

echo.
echo 测试页面已在浏览器中打开
echo 请确保服务器正在运行（uvicorn main:app --reload）
echo.
pause

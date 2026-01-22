@echo off
chcp 65001
echo ================================
echo 智能小车模拟仿真系统
echo ================================
echo.

echo [1/3] 检查依赖...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo 依赖安装失败！
    pause
    exit /b 1
)
echo.

echo [2/3] 启动后端服务...
echo 服务地址: http://localhost:8000
echo API文档: http://localhost:8000/docs
echo.

echo [3/3] 正在启动服务器...
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

pause
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import sys
import os

# 添加项目根目录到Python路径
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import settings
from database import engine, Base
from api import auth_router, websocket_router

# 创建数据库表
Base.metadata.create_all(bind=engine)

# 创建FastAPI应用
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="智能小车模拟仿真系统 - 编程教学平台"
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth_router)
app.include_router(websocket_router)

# 挂载静态文件目录（JS/CSS等资源）
static_dir = os.path.join(os.path.dirname(__file__), "static")
js_dir = os.path.join(static_dir, "js")
if os.path.exists(js_dir):
    app.mount("/js", StaticFiles(directory=js_dir), name="js")

css_dir = os.path.join(static_dir, "css")
if os.path.exists(css_dir):
    app.mount("/css", StaticFiles(directory=css_dir), name="css")

# 挂载assets目录，提供模型和资源文件
assets_dir = os.path.join(static_dir, "assets")
if os.path.exists(assets_dir):
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


@app.get("/")
async def root():
    """主页"""
    templates_dir = os.path.join(os.path.dirname(__file__), "templates")
    index_path = os.path.join(templates_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "欢迎使用智能小车模拟仿真系统"}


@app.get("/login.html")
async def login_page():
    """登录页面"""
    templates_dir = os.path.join(os.path.dirname(__file__), "templates")
    return FileResponse(os.path.join(templates_dir, "login.html"))


@app.get("/register.html")
async def register_page():
    """注册页面"""
    templates_dir = os.path.join(os.path.dirname(__file__), "templates")
    return FileResponse(os.path.join(templates_dir, "register.html"))


@app.get("/dashboard.html")
async def dashboard_page():
    """主页面"""
    templates_dir = os.path.join(os.path.dirname(__file__), "templates")
    return FileResponse(os.path.join(templates_dir, "dashboard.html"))


@app.get("/test_connection.html")
async def test_connection_page():
    """测试连接页面"""
    templates_dir = os.path.join(os.path.dirname(__file__), "templates")
    return FileResponse(os.path.join(templates_dir, "test_connection.html"))


@app.get("/simulator.html")
async def simulator_page():
    """仿真页面"""
    templates_dir = os.path.join(os.path.dirname(__file__), "templates")
    return FileResponse(os.path.join(templates_dir, "simulator.html"))


@app.get("/test_websocket.html")
async def test_websocket_page():
    """WebSocket测试页面"""
    templates_dir = os.path.join(os.path.dirname(__file__), "templates")
    return FileResponse(os.path.join(templates_dir, "test_websocket.html"))


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.VERSION}

# 路由已更新 - 2025-12-24

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "src.main:app", 
        host="0.0.0.0", 
        port=8000, 
        reload=True,
        reload_dirs=["src"]  # 监视src目录下的文件变化
    )
# 智能小车仿真系统

一个基于FastAPI的智能小车仿真平台，支持用户代码安全执行和实时仿真。

## 特性

- 安全的代码执行沙箱
- 实时小车仿真
- WebSocket通信
- 非阻塞运动控制
- 精确的时间管理模型

## 新增功能：时间管理模型

系统现在采用新的时间管理模型，具有以下特点：

### 1. 非阻塞运动控制
- 所有运动命令（`car.forward()`, `car.backward()`）立即返回
- 运动实际执行由仿真主循环控制

### 2. `car.wait()` 方法
- 新增 `car.wait()` 方法等待运动完成
- 适用于需要确保运动完成后再执行后续操作的场景

### 3. `get_position()` 行为
- `get_position()` 返回当前仿真帧的快照
- 返回的是调用时刻的位置，而非运动结束后的最终位置
- 如需获取最终位置，请在调用 `car.wait()` 后再获取

### 4. 仿真主循环控制
- 运动时长由仿真主循环完全控制
- 使用精确的 delta_time 计算位置更新
- 防止时间跳跃造成的位置突变

## 项目结构

```
icar-simulation/
├── src/                   # 源代码
│   ├── api/              # API路由
│   │   ├── __init__.py
│   │   ├── auth.py       # 认证路由
│   │   └── websocket.py  # WebSocket路由
│   ├── models/           # 数据模型
│   │   ├── __init__.py
│   │   └── user.py
│   ├── schemas/          # 数据模式
│   │   ├── __init__.py
│   │   └── user.py
│   ├── utils/            # 工具类
│   │   ├── __init__.py
│   │   ├── simulator.py  # 仿真器
│   │   ├── sandbox.py    # 代码沙箱
│   │   └── security.py   # 安全工具
│   ├── static/           # 静态资源
│   │   ├── css/
│   │   ├── js/
│   │   └── assets/
│   ├── templates/        # HTML模板
│   │   ├── index.html
│   │   ├── login.html
│   │   ├── register.html
│   │   ├── dashboard.html
│   │   ├── simulator.html
│   │   ├── test_connection.html
│   │   └── test_websocket.html
│   └── main.py           # 主应用入口
├── tests/                # 测试文件
├── docs/                 # 文档
├── examples/             # 示例代码
├── config/               # 配置文件
├── scripts/              # 脚本文件
├── .env.example
├── .gitignore
├── requirements.txt
├── README.md
├── init_db.py           # 数据库初始化
├── check_db.py          # 数据库检查
└── database.py          # 数据库配置
```

## 安装

### 1. 安装依赖
```bash
pip install -r requirements.txt
```

### 2. 初始化数据库（创建测试用户）
```bash
python init_db.py
```

这将创建两个测试账号：
- **学生账号**: `student001` / `pass123456`
- **教师账号**: `teacher_zhang` / `teach2024`

### 3. 启动后端服务
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 4. 访问系统
打开浏览器访问：`http://localhost:8000`

### 5. 测试前后端连接
访问测试页面：`http://localhost:8000/test_connection.html`

## API接口文档

### 认证接口
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户信息

## 前端页面

### 可访问的页面

| 页面 | 地址 | 描述 |
|------|------|------|
| 首页 | http://localhost:8000/ | 系统欢迎页面 |
| 登录页 | http://localhost:8000/login.html | 用户登录 |
| 注册页 | http://localhost:8000/register.html | 用户注册 |
| 主页面 | http://localhost:8000/dashboard.html | 登录后的主页 |
| 测试页面 | http://localhost:8000/test_connection.html | 前后端连接测试 |
| API文档 | http://localhost:8000/docs | 自动生成的API文档 |

### 前端特性

**登录页面 (`login.html`)**
- ✅ 实时输入验证
- ✅ 自动跳转已登录用户
- ✅ 友好的错误提示
- ✅ 加载动画效果
- ✅ Enter键快捷登录

**注册页面 (`register.html`)**
- ✅ 实时用户名格式验证
- ✅ 实时邮箱格式验证
- ✅ 实时密码强度检查
- ✅ 密码匹配验证
- ✅ 视觉反馈（绿色✓ / 红色✗）

**测试页面 (`test_connection.html`)**
- ✅ 后端健康检查
- ✅ 注册功能测试
- ✅ 登录功能测试
- ✅ Token验证测试
- ✅ 错误场景测试

## 功能特性

### 已实现功能
✅ 完整的用户注册和登录系统
✅ JWT Token认证
✅ 密码Bcrypt加密
✅ 前后端分离架构
✅ CORS跨域支持
✅ 响应式前端界面
✅ 实时表单验证
✅ 自动登录状态检查
✅ 前后端连接测试页面

### 待实现功能
- [ ] Monaco Editor代码编辑器集成
- [ ] Three.js 3D仿真场景
- [ ] WebSocket实时通信
- [ ] 虚拟小车仿真引擎
- [ ] 代码安全执行沙箱
- [ ] 教学案例和示例代码

## 配置说明

### 环境变量（可选）
创建`.env`文件：
```env
SECRET_KEY=your-secret-key-here
DATABASE_URL=sqlite+aiosqlite:///./icar_simulation.db
```

### 数据库
系统使用SQLite数据库，首次启动会自动创建数据库文件`icar_simulation.db`

## 开发说明

### 添加新的API路由
1. 在`routers/`目录下创建新的路由文件
2. 在`routers/__init__.py`中导出
3. 在`main.py`中注册路由

### 添加新的数据模型
1. 在`models/`目录下创建模型文件
2. 在`schemas/`目录下创建对应的Pydantic模式
3. 运行应用会自动创建数据表

## 注意事项
- 生产环境请修改`config.py`中的`SECRET_KEY`
- 建议生产环境使用PostgreSQL或MySQL
- 前端开发时注意修改`static/js/auth.js`中的`API_BASE_URL`

## 后续开发计划
1. 集成Monaco Editor代码编辑器
2. 实现Three.js 3D仿真场景
3. 开发虚拟小车物理引擎
4. 实现WebSocket实时通信
5. 开发代码安全执行沙箱
6. 添加教学资源管理功能

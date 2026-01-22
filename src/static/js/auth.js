// API 基础配置
const API_BASE_URL = 'http://localhost:8000';

// 安全的 localStorage 访问封装
const safeStorage = {
    getItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.warn('localStorage.getItem 失败:', e);
            return null;
        }
    },
    setItem(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            console.warn('localStorage.setItem 失败:', e);
            return false;
        }
    },
    removeItem(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            console.warn('localStorage.removeItem 失败:', e);
            return false;
        }
    }
};

// 显示加载状态
function showLoading(message = '处理中...') {
    console.log(message);
}

// 隐藏加载状态
function hideLoading() {
    console.log('完成');
}

// 验证用户名格式
function validateUsername(username) {
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) {
        return '用户名只能包含字母、数字和下划线';
    }
    if (username.length < 3) {
        return '用户名长度至少3个字符';
    }
    if (username.length > 50) {
        return '用户名长度不能超过50个字符';
    }
    return null;
}

// 验证密码格式
function validatePassword(password) {
    if (password.length < 6) {
        return '密码长度至少6个字符';
    }
    if (password.length > 100) {
        return '密码长度不能超过100个字符';
    }
    return null;
}

// 验证邮箱格式
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return '邮箱格式不正确';
    }
    return null;
}

// 用户注册
async function register(username, email, password) {
    // 前端验证
    const usernameError = validateUsername(username);
    if (usernameError) {
        return { success: false, message: usernameError };
    }
    
    const emailError = validateEmail(email);
    if (emailError) {
        return { success: false, message: emailError };
    }
    
    const passwordError = validatePassword(password);
    if (passwordError) {
        return { success: false, message: passwordError };
    }
    
    try {
        showLoading('正在注册...');
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();
        hideLoading();

        if (response.ok) {
            // 保存token和用户信息
            safeStorage.setItem('token', data.access_token);
            safeStorage.setItem('user', JSON.stringify(data.user));
            console.log('注册成功:', data.user.username);
            return { success: true, data };
        } else {
            return { success: false, message: data.detail || '注册失败' };
        }
    } catch (error) {
        hideLoading();
        console.error('注册错误:', error);
        return { success: false, message: '网络错误，请检查后端服务是否启动' };
    }
}

// 用户登录
async function login(username, password) {
    // 前端验证
    if (!username || !password) {
        return { success: false, message: '用户名和密码不能为空' };
    }
    
    try {
        showLoading('正在登录...');
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        hideLoading();

        if (response.ok) {
            // 保存token和用户信息
            safeStorage.setItem('token', data.access_token);
            safeStorage.setItem('user', JSON.stringify(data.user));
            console.log('登录成功:', data.user.username);
            return { success: true, data };
        } else {
            return { success: false, message: data.detail || '登录失败' };
        }
    } catch (error) {
        hideLoading();
        console.error('登录错误:', error);
        return { success: false, message: '网络错误，请检查后端服务是否启动' };
    }
}

// 获取当前用户信息
async function getCurrentUser() {
    try {
        const token = safeStorage.getItem('token');
        if (!token) {
            return null;
        }

        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const user = await response.json();
            safeStorage.setItem('user', JSON.stringify(user));
            return user;
        } else if (response.status === 401) {
            // Token过期或无效，清除本地存储
            console.log('Token已过期，请重新登录');
            logout();
            return null;
        } else {
            console.error('获取用户信息失败:', response.status);
            return null;
        }
    } catch (error) {
        console.error('获取用户信息错误:', error);
        return null;
    }
}

// 用户登出
function logout() {
    safeStorage.removeItem('token');
    safeStorage.removeItem('user');
    console.log('已退出登录');
}

// 检查是否已登录
function isLoggedIn() {
    const token = safeStorage.getItem('token');
    return token !== null && token !== 'undefined' && token !== '';
}

// 获取存储的用户信息
function getStoredUser() {
    const userStr = safeStorage.getItem('user');
    try {
        return userStr ? JSON.parse(userStr) : null;
    } catch (e) {
        console.error('解析用户信息失败:', e);
        return null;
    }
}

// 获取token
function getToken() {
    return safeStorage.getItem('token');
}

// 检查Token是否过期（简单检查，真实过期由后端判断）
function isTokenExpired() {
    const token = getToken();
    if (!token) return true;
    
    try {
        // 解析JWT token的payload部分
        const payload = JSON.parse(atob(token.split('.')[1]));
        const exp = payload.exp;
        if (!exp) return false;
        
        // 检查是否过期（留5分钟缓冲）
        return Date.now() >= (exp * 1000 - 5 * 60 * 1000);
    } catch (e) {
        console.error('解析Token失败:', e);
        return true;
    }
}

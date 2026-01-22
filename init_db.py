"""
数据库初始化脚本
创建测试用户
"""
import sys
from database import SessionLocal, engine, Base
from src.models import User
from utils import get_password_hash

def init_database():
    """初始化数据库并创建测试用户"""
    print("=" * 50)
    print("智能小车模拟仿真系统 - 数据库初始化")
    print("=" * 50)
    
    # 创建所有表
    print("\n[1/3] 创建数据库表...")
    Base.metadata.create_all(bind=engine)
    print("✓ 数据库表创建成功")
    
    # 创建数据库会话
    db = SessionLocal()
    
    try:
        # 检查是否已有用户
        existing_users = db.query(User).count()
        if existing_users > 0:
            print(f"\n数据库中已有 {existing_users} 个用户")
            response = input("是否清空现有数据并重新创建测试用户？(y/n): ")
            if response.lower() != 'y':
                print("操作已取消")
                return
            
            # 删除所有用户
            db.query(User).delete()
            db.commit()
            print("✓ 已清空现有用户数据")
        
        print("\n[2/3] 创建测试用户...")
        
        # 密码
        password1 = "pass123456"
        password2 = "teach2024"
        
        # 测试用户1
        test_user1 = User(
            username="student001",
            email="student001@example.com",
            hashed_password=get_password_hash(password1),
            is_active=True,
            is_admin=False
        )
        db.add(test_user1)
        
        # 测试用户2
        test_user2 = User(
            username="teacher_zhang",
            email="teacher.zhang@example.com",
            hashed_password=get_password_hash(password2),
            is_active=True,
            is_admin=True
        )
        db.add(test_user2)
        
        db.commit()
        print("✓ 测试用户创建成功")
        
        print("\n[3/3] 测试用户信息:")
        print("-" * 50)
        print("用户1:")
        print(f"  用户名: {test_user1.username}")
        print(f"  密码: pass123456")
        print(f"  邮箱: {test_user1.email}")
        print(f"  角色: 普通用户")
        print()
        print("用户2:")
        print(f"  用户名: {test_user2.username}")
        print(f"  密码: teach2024")
        print(f"  邮箱: {test_user2.email}")
        print(f"  角色: 管理员")
        print("-" * 50)
        
        print("\n✓ 数据库初始化完成！")
        print("\n你可以使用以上账号登录系统")
        print("访问地址: http://localhost:8000")
        
    except Exception as e:
        db.rollback()
        print(f"\n✗ 初始化失败: {str(e)}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    init_database()

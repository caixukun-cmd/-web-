"""
检查数据库用户
"""
from database import SessionLocal
from src.models import User

db = SessionLocal()

try:
    users = db.query(User).all()
    print(f"\n数据库中有 {len(users)} 个用户:\n")
    
    for user in users:
        print(f"ID: {user.id}")
        print(f"用户名: {user.username}")
        print(f"邮箱: {user.email}")
        print(f"密码哈希: {user.hashed_password[:50]}...")
        print(f"是否激活: {user.is_active}")
        print(f"是否管理员: {user.is_admin}")
        print(f"创建时间: {user.created_at}")
        print("-" * 50)
        
finally:
    db.close()

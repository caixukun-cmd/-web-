"""
测试密码验证
"""
from utils import get_password_hash, verify_password
from database import SessionLocal
from src.models import User

# 测试加密和验证
password = "pass123456"
hashed = get_password_hash(password)

print(f"原始密码: {password}")
print(f"加密后: {hashed}")
print(f"验证结果: {verify_password(password, hashed)}")
print()

# 从数据库获取用户并验证
db = SessionLocal()
try:
    user = db.query(User).filter(User.username == "student001").first()
    if user:
        print(f"数据库用户: {user.username}")
        print(f"数据库密码哈希: {user.hashed_password}")
        
        test_password = "pass123456"
        print(f"\n测试密码: {test_password}")
        
        try:
            result = verify_password(test_password, user.hashed_password)
            print(f"验证结果: {result}")
        except Exception as e:
            print(f"验证错误: {str(e)}")
            import traceback
            traceback.print_exc()
            
finally:
    db.close()

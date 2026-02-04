const bcrypt = require('bcryptjs');
const { Merchant } = require('./models');

async function initAdmin() {
  try {
    // 检查是否已有管理员
    const adminExists = await Merchant.findOne({ where: { role: 'admin' } });
    
    if (!adminExists) {
      // 创建默认管理员
      const hashedPassword = await bcrypt.hash('admin123456', 10);
      
      await Merchant.create({
        name: '超级管理员',
        email: 'admin@smsplatform.com',
        password: hashedPassword,
        phone: '+85251337568',
        status: 'active',
        role: 'admin',
        balance: 0
      });
      
      console.log('✅ 默认管理员创建成功:');
      console.log('   邮箱: admin@smsplatform.com');
      console.log('   密码: admin123456');
    } else {
      console.log('✅ 管理员账号已存在');
    }
  } catch (error) {
    console.error('❌ 创建管理员失败:', error.message);
  }
}

module.exports = { initAdmin };

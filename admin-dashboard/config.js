// API Configuration
// 修改下面的地址为你的后端 API 地址
const API_CONFIG = {
    // 开发环境（本地测试）
    development: 'https://smsplatform.loca.lt',
    
    // 生产环境（部署后）
    // 部署到 Render 后，把这里改成你的 Render 地址，例如：
    // production: 'https://sms-platform-api.onrender.com'
    production: 'https://sms-platform-api.onrender.com'
};

// 当前使用的环境
const CURRENT_ENV = 'development'; // 部署后改成 'production'

// 获取 API 基础地址
function getApiBase() {
    return API_CONFIG[CURRENT_ENV] || API_CONFIG.development;
}

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { API_CONFIG, CURRENT_ENV, getApiBase };
}

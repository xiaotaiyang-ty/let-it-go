/**
 * 配置文件
 * 在 Vercel 部署时，API_BASE 会自动指向同域
 */

const CONFIG = {
  // API 基础地址（部署后使用相对路径）
  API_BASE: '',

  // Token 存储键
  TOKEN_KEY: 'buneihao_token',
  USER_KEY: 'buneihao_user',

  // 本地存储键
  CONVERSATION_KEY: 'buneihao_conversation',
  MESSAGES_KEY: 'buneihao_messages'
};

// 开发环境检测
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  // 本地开发时，可能需要指定后端地址
  // CONFIG.API_BASE = 'http://localhost:3000';
}

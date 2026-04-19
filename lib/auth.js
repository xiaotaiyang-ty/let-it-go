/**
 * JWT 认证模块
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const TOKEN_EXPIRY = '7d'; // Token 有效期 7 天

/**
 * 生成 JWT Token
 */
function generateToken(userId, nickname) {
  return jwt.sign(
    { userId, nickname },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * 验证 JWT Token
 * @returns {Object|null} 解析后的用户信息，失败返回 null
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * 从请求中提取并验证用户
 * @param {Request} req - HTTP 请求对象
 * @returns {Object|null} 用户信息或 null
 */
function getUserFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7);
  return verifyToken(token);
}

/**
 * 认证中间件 - 用于 Vercel Serverless
 * @returns {Object} { user, error, status }
 */
function requireAuth(req) {
  const user = getUserFromRequest(req);
  if (!user) {
    return {
      user: null,
      error: '请先登录',
      status: 401
    };
  }
  return { user, error: null, status: 200 };
}

module.exports = {
  generateToken,
  verifyToken,
  getUserFromRequest,
  requireAuth
};

/**
 * 获取当前用户信息
 * GET /api/auth/me
 * Headers: Authorization: Bearer <token>
 */

const { ObjectId } = require('mongodb');
const { getCollection } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { FREE_DAILY_LIMIT } = require('../../lib/ai');

module.exports = async function handler(req, res) {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: '只支持 GET 请求' });
  }

  try {
    // 验证登录
    const { user, error, status } = requireAuth(req);
    if (error) {
      return res.status(status).json({ error });
    }

    const users = await getCollection('users');
    const userData = await users.findOne({ _id: new ObjectId(user.userId) });

    if (!userData) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 检查是否需要重置每日额度
    const today = new Date().toDateString();
    const resetDate = userData.free_usage_reset_date
      ? new Date(userData.free_usage_reset_date).toDateString()
      : null;

    let freeUsageToday = userData.free_usage_today || 0;
    if (resetDate !== today) {
      freeUsageToday = 0;
    }

    return res.status(200).json({
      success: true,
      user: {
        id: userData._id.toString(),
        nickname: userData.nickname,
        use_own_api: userData.use_own_api || false,
        has_own_api_key: !!userData.own_api_key,
        own_api_model: userData.own_api_model,
        free_usage_today: freeUsageToday,
        free_usage_total: userData.free_usage_total || 0,
        free_daily_limit: FREE_DAILY_LIMIT,
        created_at: userData.created_at
      }
    });

  } catch (error) {
    console.error('获取用户信息错误:', error);
    return res.status(500).json({ error: '服务器错误，请稍后重试' });
  }
};

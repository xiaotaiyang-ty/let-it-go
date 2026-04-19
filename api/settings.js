/**
 * 用户设置接口
 * GET /api/settings - 获取设置
 * PUT /api/settings - 更新设置（API 配置）
 */

const { ObjectId } = require('mongodb');
const { getCollection } = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { logUserAction, FREE_DAILY_LIMIT } = require('../lib/ai');

module.exports = async function handler(req, res) {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 验证登录
  const { user, error, status } = requireAuth(req);
  if (error) {
    return res.status(status).json({ error });
  }

  const userId = new ObjectId(user.userId);

  try {
    const users = await getCollection('users');

    if (req.method === 'GET') {
      // 获取设置
      const userData = await users.findOne({ _id: userId });

      if (!userData) {
        return res.status(404).json({ error: '用户不存在' });
      }

      return res.status(200).json({
        success: true,
        settings: {
          use_own_api: userData.use_own_api || false,
          has_own_api_key: !!userData.own_api_key,
          own_api_model: userData.own_api_model || 'deepseek-v3-2-251201',
          own_api_endpoint: userData.own_api_endpoint || '',
          free_usage_today: userData.free_usage_today || 0,
          free_daily_limit: FREE_DAILY_LIMIT,
          available_models: [
            { id: 'deepseek-v3-2-251201', name: 'DeepSeek V3（推荐）' },
            { id: 'deepseek-r1-250120', name: 'DeepSeek R1' },
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
            { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' }
          ]
        }
      });

    } else if (req.method === 'PUT') {
      // 更新设置
      const { use_own_api, own_api_key, own_api_model, own_api_endpoint } = req.body;

      const updateData = {};

      if (typeof use_own_api === 'boolean') {
        updateData.use_own_api = use_own_api;
      }

      if (own_api_key !== undefined) {
        // 如果传入空字符串，清除 Key
        updateData.own_api_key = own_api_key || null;
      }

      if (own_api_model) {
        updateData.own_api_model = own_api_model;
      }

      if (own_api_endpoint !== undefined) {
        updateData.own_api_endpoint = own_api_endpoint || null;
      }

      await users.updateOne(
        { _id: userId },
        { $set: updateData }
      );

      // 记录日志
      await logUserAction(userId, 'api_config_change', {
        api_source: use_own_api ? 'own' : 'free'
      });

      return res.status(200).json({
        success: true,
        message: '设置已更新'
      });

    } else {
      return res.status(405).json({ error: '不支持的请求方法' });
    }

  } catch (error) {
    console.error('设置操作错误:', error);
    return res.status(500).json({ error: '服务器错误，请稍后重试' });
  }
};

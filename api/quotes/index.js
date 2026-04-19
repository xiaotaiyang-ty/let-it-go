/**
 * 收藏金句列表接口
 * GET /api/quotes - 获取收藏列表
 * POST /api/quotes - 添加收藏
 */

const { ObjectId } = require('mongodb');
const { getCollection } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { logUserAction } = require('../../lib/ai');

module.exports = async function handler(req, res) {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
    const quotes = await getCollection('saved_quotes');

    if (req.method === 'GET') {
      // 获取收藏列表
      const list = await quotes
        .find({ user_id: userId })
        .sort({ saved_at: -1 })
        .limit(100)
        .toArray();

      return res.status(200).json({
        success: true,
        quotes: list.map(q => ({
          id: q._id.toString(),
          quote: q.quote,
          source: q.source,
          saved_at: q.saved_at
        }))
      });

    } else if (req.method === 'POST') {
      // 添加收藏
      const { quote, source } = req.body;

      if (!quote) {
        return res.status(400).json({ error: '金句内容不能为空' });
      }

      // 检查是否已收藏
      const existing = await quotes.findOne({
        user_id: userId,
        quote: quote
      });

      if (existing) {
        return res.status(400).json({ error: '已经收藏过了' });
      }

      const result = await quotes.insertOne({
        user_id: userId,
        quote,
        source: source || '未知来源',
        saved_at: new Date()
      });

      // 记录日志
      await logUserAction(userId, 'quote_save', { quote });

      return res.status(201).json({
        success: true,
        quote: {
          id: result.insertedId.toString(),
          quote,
          source: source || '未知来源'
        }
      });

    } else {
      return res.status(405).json({ error: '不支持的请求方法' });
    }

  } catch (error) {
    console.error('收藏操作错误:', error);
    return res.status(500).json({ error: '服务器错误，请稍后重试' });
  }
};

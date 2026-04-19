/**
 * 单个收藏操作接口
 * DELETE /api/quotes/[id] - 取消收藏
 */

const { ObjectId } = require('mongodb');
const { getCollection } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { logUserAction } = require('../../lib/ai');

module.exports = async function handler(req, res) {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: '只支持 DELETE 请求' });
  }

  // 验证登录
  const { user, error, status } = requireAuth(req);
  if (error) {
    return res.status(status).json({ error });
  }

  const userId = new ObjectId(user.userId);

  // 从 URL 获取收藏 ID
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathParts = url.pathname.split('/');
  const quoteId = pathParts[pathParts.length - 1];

  if (!quoteId || !ObjectId.isValid(quoteId)) {
    return res.status(400).json({ error: '无效的收藏 ID' });
  }

  try {
    const quotes = await getCollection('saved_quotes');

    const result = await quotes.deleteOne({
      _id: new ObjectId(quoteId),
      user_id: userId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: '收藏不存在' });
    }

    // 记录日志
    await logUserAction(userId, 'quote_remove', { quote_id: quoteId });

    return res.status(200).json({
      success: true,
      message: '已取消收藏'
    });

  } catch (error) {
    console.error('取消收藏错误:', error);
    return res.status(500).json({ error: '服务器错误，请稍后重试' });
  }
};

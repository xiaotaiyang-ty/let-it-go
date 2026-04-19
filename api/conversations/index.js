/**
 * 对话列表接口
 * GET /api/conversations - 获取对话列表
 * POST /api/conversations - 创建新对话
 */

const { ObjectId } = require('mongodb');
const { getCollection } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

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
    if (req.method === 'GET') {
      // 获取对话列表
      const conversations = await getCollection('conversations');
      const list = await conversations
        .find({ user_id: userId })
        .sort({ updated_at: -1 })
        .limit(50)
        .project({
          title: 1,
          created_at: 1,
          updated_at: 1,
          'messages': { $slice: -1 } // 只返回最后一条消息
        })
        .toArray();

      return res.status(200).json({
        success: true,
        conversations: list.map(c => ({
          id: c._id.toString(),
          title: c.title,
          last_message: c.messages?.[0]?.content?.substring(0, 50) || '',
          created_at: c.created_at,
          updated_at: c.updated_at
        }))
      });

    } else if (req.method === 'POST') {
      // 创建新对话
      const { title } = req.body;
      const conversations = await getCollection('conversations');

      const result = await conversations.insertOne({
        user_id: userId,
        title: title || '新对话',
        messages: [],
        created_at: new Date(),
        updated_at: new Date()
      });

      return res.status(201).json({
        success: true,
        conversation: {
          id: result.insertedId.toString(),
          title: title || '新对话'
        }
      });

    } else {
      return res.status(405).json({ error: '不支持的请求方法' });
    }

  } catch (error) {
    console.error('对话列表错误:', error);
    return res.status(500).json({ error: '服务器错误，请稍后重试' });
  }
};

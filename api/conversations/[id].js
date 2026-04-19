/**
 * 单个对话操作接口
 * GET /api/conversations/[id] - 获取对话详情
 * DELETE /api/conversations/[id] - 删除对话
 */

const { ObjectId } = require('mongodb');
const { getCollection } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { logUserAction } = require('../../lib/ai');

module.exports = async function handler(req, res) {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
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

  // 从 URL 获取对话 ID
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathParts = url.pathname.split('/');
  const conversationId = pathParts[pathParts.length - 1];

  if (!conversationId || !ObjectId.isValid(conversationId)) {
    return res.status(400).json({ error: '无效的对话 ID' });
  }

  try {
    const conversations = await getCollection('conversations');
    const convObjectId = new ObjectId(conversationId);

    if (req.method === 'GET') {
      // 获取对话详情
      const conversation = await conversations.findOne({
        _id: convObjectId,
        user_id: userId
      });

      if (!conversation) {
        return res.status(404).json({ error: '对话不存在' });
      }

      return res.status(200).json({
        success: true,
        conversation: {
          id: conversation._id.toString(),
          title: conversation.title,
          messages: conversation.messages,
          created_at: conversation.created_at,
          updated_at: conversation.updated_at
        }
      });

    } else if (req.method === 'DELETE') {
      // 删除对话
      const result = await conversations.deleteOne({
        _id: convObjectId,
        user_id: userId
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: '对话不存在' });
      }

      // 记录日志
      await logUserAction(userId, 'conversation_delete', {
        conversation_id: conversationId
      });

      return res.status(200).json({
        success: true,
        message: '对话已删除'
      });

    } else {
      return res.status(405).json({ error: '不支持的请求方法' });
    }

  } catch (error) {
    console.error('对话操作错误:', error);
    return res.status(500).json({ error: '服务器错误，请稍后重试' });
  }
};

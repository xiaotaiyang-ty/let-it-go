/**
 * 管理后台 - 数据统计 API
 * GET /api/admin/stats
 * Headers: X-Admin-Key: <admin_key>
 */

const { getCollection } = require('../../lib/db');

// 管理员密钥（从环境变量读取）
const ADMIN_KEY = process.env.ADMIN_KEY || 'buneihao-admin-2026';

module.exports = async function handler(req, res) {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: '只支持 GET 请求' });
  }

  // 验证管理员密钥
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: '管理员密钥错误' });
  }

  try {
    const users = await getCollection('users');
    const conversations = await getCollection('conversations');
    const savedQuotes = await getCollection('saved_quotes');
    const userLogs = await getCollection('user_logs');

    // 时间范围
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // 并行查询统计数据
    const [
      totalUsers,
      todayNewUsers,
      weekActiveUsers,
      totalConversations,
      todayConversations,
      totalMessages,
      todayMessages,
      totalQuotes,
      functionStats,
      recentUsers,
      dailyStats
    ] = await Promise.all([
      // 总用户数
      users.countDocuments(),

      // 今日新增用户
      users.countDocuments({ created_at: { $gte: todayStart } }),

      // 7日活跃用户
      users.countDocuments({ last_login_at: { $gte: weekAgo } }),

      // 总对话数
      conversations.countDocuments(),

      // 今日对话数
      conversations.countDocuments({ created_at: { $gte: todayStart } }),

      // 总消息数（估算：对话数 * 平均轮次）
      userLogs.countDocuments({ event_type: 'chat_receive' }),

      // 今日消息数
      userLogs.countDocuments({
        event_type: 'chat_receive',
        timestamp: { $gte: todayStart }
      }),

      // 总收藏数
      savedQuotes.countDocuments(),

      // 功能使用统计
      userLogs.aggregate([
        { $match: { event_type: 'chat_receive', 'details.function_name': { $ne: null } } },
        { $group: { _id: '$details.function_name', count: { $sum: 1 } } }
      ]).toArray(),

      // 最近注册的用户
      users.find()
        .sort({ created_at: -1 })
        .limit(10)
        .project({ nickname: 1, created_at: 1, last_login_at: 1, free_usage_total: 1 })
        .toArray(),

      // 过去7天每日统计
      getDailyStats(userLogs, weekAgo)
    ]);

    // 计算留存率（简化版：7日内登录过的用户 / 总用户）
    const retentionRate = totalUsers > 0
      ? Math.round((weekActiveUsers / totalUsers) * 100)
      : 0;

    // 功能使用统计格式化
    const functionUsage = {};
    functionStats.forEach(f => {
      if (f._id) functionUsage[f._id] = f.count;
    });

    return res.status(200).json({
      success: true,
      stats: {
        overview: {
          totalUsers,
          todayNewUsers,
          weekActiveUsers,
          retentionRate: `${retentionRate}%`
        },
        conversations: {
          total: totalConversations,
          today: todayConversations,
          totalMessages,
          todayMessages
        },
        engagement: {
          totalQuotes,
          functionUsage: {
            '换位思考': functionUsage['换位思考'] || 0,
            '停止灾难化': functionUsage['停止灾难化'] || 0
          },
          avgMessagesPerUser: totalUsers > 0
            ? Math.round(totalMessages / totalUsers * 10) / 10
            : 0
        },
        recentUsers: recentUsers.map(u => ({
          nickname: u.nickname,
          createdAt: u.created_at,
          lastLogin: u.last_login_at,
          totalUsage: u.free_usage_total || 0
        })),
        dailyStats
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('统计查询错误:', error);
    return res.status(500).json({ error: '服务器错误' });
  }
};

/**
 * 获取每日统计
 */
async function getDailyStats(userLogs, startDate) {
  try {
    const stats = await userLogs.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate },
          event_type: { $in: ['register', 'login', 'chat_receive'] }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            event: '$event_type'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]).toArray();

    // 格式化为按日期分组
    const daily = {};
    stats.forEach(s => {
      const date = s._id.date;
      if (!daily[date]) {
        daily[date] = { date, newUsers: 0, logins: 0, messages: 0 };
      }
      if (s._id.event === 'register') daily[date].newUsers = s.count;
      if (s._id.event === 'login') daily[date].logins = s.count;
      if (s._id.event === 'chat_receive') daily[date].messages = s.count;
    });

    return Object.values(daily);
  } catch {
    return [];
  }
}

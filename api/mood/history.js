/**
 * 心情历史记录接口
 * GET /api/mood/history
 * 获取用户的心情分析历史
 */

const { ObjectId } = require('mongodb');
const { getCollection } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

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

    const userId = new ObjectId(user.userId);
    const { days = 30 } = req.query; // 默认获取30天内的记录

    // 计算日期范围
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    startDate.setHours(0, 0, 0, 0);

    // 获取心情记录
    const moodRecords = await getCollection('mood_records');
    const records = await moodRecords
      .find({
        user_id: userId,
        date: { $gte: startDate }
      })
      .sort({ date: -1 })
      .limit(30)
      .toArray();

    // 计算统计数据
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

    // 本周记录
    const weekRecords = records.filter(r => r.date >= weekAgo);

    // 计算本周平均分
    let weekAvgScore = null;
    if (weekRecords.length > 0) {
      const totalScore = weekRecords.reduce((sum, r) => sum + (r.score || 0), 0);
      weekAvgScore = Math.round(totalScore / weekRecords.length);
    }

    // 今日记录
    const todayRecord = records.find(r => {
      const recordDate = new Date(r.date);
      recordDate.setHours(0, 0, 0, 0);
      return recordDate.getTime() === today.getTime();
    });

    // 获取本周对话次数
    const conversations = await getCollection('conversations');
    const weekConvCount = await conversations.countDocuments({
      user_id: userId,
      updated_at: { $gte: weekAgo }
    });

    return res.status(200).json({
      success: true,
      stats: {
        week_avg_score: weekAvgScore,
        week_chat_count: weekConvCount,
        week_record_days: weekRecords.length,
        total_records: records.length
      },
      today: todayRecord ? {
        id: todayRecord._id.toString(),
        score: todayRecord.score,
        emoji: todayRecord.emoji,
        mood_label: todayRecord.mood_label,
        keywords: todayRecord.keywords,
        summary: todayRecord.summary,
        suggestion: todayRecord.suggestion,
        analyzed_at: todayRecord.analyzed_at
      } : null,
      history: records.map(r => ({
        id: r._id.toString(),
        date: r.date,
        score: r.score,
        emoji: r.emoji,
        mood_label: r.mood_label,
        keywords: r.keywords,
        summary: r.summary,
        analyzed_at: r.analyzed_at
      }))
    });

  } catch (error) {
    console.error('获取心情历史错误:', error);
    return res.status(500).json({ error: '服务器错误，请稍后重试' });
  }
};

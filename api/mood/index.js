/**
 * 心情模块接口（合并版）
 * GET /api/mood - 获取心情历史
 * POST /api/mood - AI心情分析（消耗1次额度）
 */

const { ObjectId } = require('mongodb');
const { getCollection } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { checkAndUpdateQuota, getApiConfig, logUserAction } = require('../../lib/ai');

// 心情分析 Prompt
const MOOD_ANALYZE_PROMPT = `你是一位温柔的心理观察师，请根据用户今天的对话内容，分析ta的心情状态。

请用以下 JSON 格式返回（不要返回其他内容）：
{
  "score": 75,
  "emoji": "🙂",
  "mood_label": "平静",
  "keywords": ["工作", "压力"],
  "summary": "今天你似乎在工作上遇到了一些压力，但整体状态还不错。",
  "suggestion": "记得给自己一点放松的时间，你已经很努力了。"
}

字段说明：
- score: 心情分数 0-100，越高越好
- emoji: 代表心情的表情，如 😊😐😔😢😤
- mood_label: 心情标签，如 开心、平静、焦虑、低落、疲惫
- keywords: 今天聊天涉及的主题，最多3个
- summary: 一句话总结今天的心情（20-40字）
- suggestion: 一句温暖的建议（15-30字）

如果对话内容太少或无法判断，score 给 60-70，mood_label 写"未知"，summary 写"今天聊得不多，有什么想说的随时找我"。`;

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
      // 获取心情历史
      return await getHistory(req, res, userId);
    } else if (req.method === 'POST') {
      // AI 心情分析
      return await analyzeMood(req, res, userId);
    } else {
      return res.status(405).json({ error: '不支持的请求方法' });
    }
  } catch (error) {
    console.error('心情接口错误:', error);
    return res.status(500).json({ error: '服务器错误，请稍后重试' });
  }
};

/**
 * 获取心情历史
 */
async function getHistory(req, res, userId) {
  const { days = 30 } = req.query;

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
}

/**
 * AI 心情分析
 */
async function analyzeMood(req, res, userId) {
  const { force_refresh } = req.body || {};

  // 检查今天是否已经分析过
  const moodRecords = await getCollection('mood_records');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existingRecord = await moodRecords.findOne({
    user_id: userId,
    date: { $gte: today }
  });

  // 如果已有记录且不是强制刷新，直接返回
  if (existingRecord && !force_refresh) {
    return res.status(200).json({
      success: true,
      already_analyzed: true,
      mood: {
        id: existingRecord._id.toString(),
        score: existingRecord.score,
        emoji: existingRecord.emoji,
        mood_label: existingRecord.mood_label,
        keywords: existingRecord.keywords,
        summary: existingRecord.summary,
        suggestion: existingRecord.suggestion,
        analyzed_at: existingRecord.analyzed_at
      }
    });
  }

  // 检查额度（心情分析消耗 1 次）
  const quota = await checkAndUpdateQuota(userId);
  if (!quota.allowed) {
    return res.status(429).json({
      error: quota.message,
      remaining: quota.remaining
    });
  }

  // 获取今天的对话内容
  const conversations = await getCollection('conversations');
  const todayConvs = await conversations
    .find({
      user_id: userId,
      updated_at: { $gte: today }
    })
    .toArray();

  // 提取用户消息
  let userMessages = [];
  todayConvs.forEach(conv => {
    if (conv.messages) {
      conv.messages.forEach(msg => {
        if (msg.role === 'user') {
          userMessages.push(msg.content);
        }
      });
    }
  });

  // 如果没有对话，返回默认结果
  if (userMessages.length === 0) {
    const defaultMood = {
      score: 65,
      emoji: '🤔',
      mood_label: '未知',
      keywords: [],
      summary: '今天还没有聊过天呢，有什么想说的随时找我。',
      suggestion: '和我聊聊，让我更了解你的心情。'
    };

    const result = await moodRecords.insertOne({
      user_id: userId,
      date: today,
      ...defaultMood,
      message_count: 0,
      analyzed_at: new Date()
    });

    return res.status(200).json({
      success: true,
      mood: {
        id: result.insertedId.toString(),
        ...defaultMood,
        analyzed_at: new Date()
      }
    });
  }

  // 获取 API 配置
  const apiConfig = await getApiConfig(userId);

  // 调用 AI 分析
  const analysisContent = userMessages.join('\n---\n');
  const response = await fetch(apiConfig.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiConfig.apiKey}`
    },
    body: JSON.stringify({
      model: apiConfig.model,
      messages: [
        { role: 'system', content: MOOD_ANALYZE_PROMPT },
        { role: 'user', content: `以下是我今天的聊天内容：\n\n${analysisContent}` }
      ],
      temperature: 0.7
    })
  });

  if (!response.ok) {
    console.error('AI 分析错误:', response.status);
    return res.status(500).json({ error: 'AI 分析服务暂时不可用' });
  }

  const aiResult = await response.json();
  const aiContent = aiResult.choices?.[0]?.message?.content || '';

  // 解析 AI 返回的 JSON
  let moodData;
  try {
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      moodData = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('无法解析 AI 返回');
    }
  } catch (e) {
    console.error('解析 AI 返回失败:', e, aiContent);
    moodData = {
      score: 65,
      emoji: '🙂',
      mood_label: '平静',
      keywords: [],
      summary: '今天的你看起来还不错。',
      suggestion: '继续保持，有什么想说的随时找我。'
    };
  }

  // 确保数据合法
  moodData.score = Math.max(0, Math.min(100, Number(moodData.score) || 65));
  moodData.keywords = Array.isArray(moodData.keywords) ? moodData.keywords.slice(0, 3) : [];

  // 保存或更新记录
  if (existingRecord) {
    await moodRecords.updateOne(
      { _id: existingRecord._id },
      {
        $set: {
          ...moodData,
          message_count: userMessages.length,
          analyzed_at: new Date()
        }
      }
    );
  } else {
    await moodRecords.insertOne({
      user_id: userId,
      date: today,
      ...moodData,
      message_count: userMessages.length,
      analyzed_at: new Date()
    });
  }

  // 记录日志
  await logUserAction(userId, 'mood_analyze', {
    message_count: userMessages.length,
    score: moodData.score,
    force_refresh: !!force_refresh
  });

  return res.status(200).json({
    success: true,
    mood: {
      ...moodData,
      analyzed_at: new Date()
    }
  });
}

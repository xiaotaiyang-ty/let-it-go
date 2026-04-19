/**
 * AI 调用模块
 * 支持免费额度和用户自带 Key
 */

const { getCollection } = require('./db');

// 默认配置
const DEFAULT_API_ENDPOINT = process.env.AI_API_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const DEFAULT_API_KEY = process.env.AI_API_KEY;
const DEFAULT_MODEL = process.env.AI_MODEL || 'deepseek-v3-2-251201';
const FREE_DAILY_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT) || 10;

/**
 * 检查并更新用户免费额度
 * @returns {Object} { allowed: boolean, remaining: number, message: string }
 */
async function checkAndUpdateQuota(userId) {
  const users = await getCollection('users');
  const user = await users.findOne({ _id: userId });

  if (!user) {
    return { allowed: false, remaining: 0, message: '用户不存在' };
  }

  // 如果用户使用自己的 Key，不消耗免费额度
  if (user.use_own_api && user.own_api_key) {
    return { allowed: true, remaining: -1, message: '使用自己的 API Key' };
  }

  // 检查今日免费额度
  const today = new Date().toDateString();
  const userResetDate = user.free_usage_reset_date ? new Date(user.free_usage_reset_date).toDateString() : null;

  let todayUsage = user.free_usage_today || 0;

  // 如果是新的一天，重置计数
  if (userResetDate !== today) {
    todayUsage = 0;
    await users.updateOne(
      { _id: userId },
      {
        $set: {
          free_usage_today: 0,
          free_usage_reset_date: new Date()
        }
      }
    );
  }

  if (todayUsage >= FREE_DAILY_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      message: `今日免费额度已用完（${FREE_DAILY_LIMIT}次/天），请配置自己的 API Key 或明天再来`
    };
  }

  // 消耗一次额度
  await users.updateOne(
    { _id: userId },
    {
      $inc: { free_usage_today: 1, free_usage_total: 1 },
      $set: { free_usage_reset_date: new Date() }
    }
  );

  return {
    allowed: true,
    remaining: FREE_DAILY_LIMIT - todayUsage - 1,
    message: `剩余免费次数：${FREE_DAILY_LIMIT - todayUsage - 1}`
  };
}

/**
 * 获取用户的 API 配置
 */
async function getApiConfig(userId) {
  const users = await getCollection('users');
  const user = await users.findOne({ _id: userId });

  if (user && user.use_own_api && user.own_api_key) {
    return {
      apiKey: user.own_api_key,
      model: user.own_api_model || DEFAULT_MODEL,
      endpoint: user.own_api_endpoint || DEFAULT_API_ENDPOINT,
      source: 'own'
    };
  }

  return {
    apiKey: DEFAULT_API_KEY,
    model: DEFAULT_MODEL,
    endpoint: DEFAULT_API_ENDPOINT,
    source: 'free'
  };
}

/**
 * 调用 AI API（流式）
 * @returns {ReadableStream} SSE 流
 */
async function callAI(messages, apiConfig) {
  const response = await fetch(apiConfig.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiConfig.apiKey}`
    },
    body: JSON.stringify({
      model: apiConfig.model,
      messages: messages,
      stream: true
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI API 错误: ${response.status} - ${error}`);
  }

  return response.body;
}

/**
 * 记录用户行为日志
 */
async function logUserAction(userId, eventType, details = {}) {
  try {
    const logs = await getCollection('user_logs');
    await logs.insertOne({
      user_id: userId,
      event_type: eventType,
      timestamp: new Date(),
      details
    });
  } catch (error) {
    console.error('日志记录失败:', error);
  }
}

module.exports = {
  checkAndUpdateQuota,
  getApiConfig,
  callAI,
  logUserAction,
  FREE_DAILY_LIMIT
};

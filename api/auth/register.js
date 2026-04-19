/**
 * 用户注册接口
 * POST /api/auth/register
 * Body: { nickname, password }
 */

const bcrypt = require('bcryptjs');
const { getCollection } = require('../../lib/db');
const { generateToken } = require('../../lib/auth');
const { logUserAction } = require('../../lib/ai');

module.exports = async function handler(req, res) {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持 POST 请求' });
  }

  try {
    const { nickname, password } = req.body;

    // 参数验证
    if (!nickname || !password) {
      return res.status(400).json({ error: '昵称和密码不能为空' });
    }

    if (nickname.length < 2 || nickname.length > 20) {
      return res.status(400).json({ error: '昵称长度需要在 2-20 字符之间' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少需要 6 位' });
    }

    const users = await getCollection('users');

    // 检查昵称是否已存在（作为唯一标识）
    const existing = await users.findOne({ nickname });
    if (existing) {
      return res.status(400).json({ error: '该昵称已被使用，请换一个' });
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(password, 10);

    // 创建用户
    const result = await users.insertOne({
      nickname,
      password_hash: passwordHash,
      use_own_api: false,
      own_api_key: null,
      own_api_model: null,
      free_usage_today: 0,
      free_usage_total: 0,
      free_usage_reset_date: new Date(),
      created_at: new Date(),
      last_login_at: new Date()
    });

    const userId = result.insertedId;

    // 生成 Token
    const token = generateToken(userId.toString(), nickname);

    // 记录日志
    await logUserAction(userId, 'register', {});

    // 获取免费额度配置
    const FREE_DAILY_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT) || 10;

    return res.status(201).json({
      success: true,
      message: '注册成功',
      token,
      user: {
        id: userId.toString(),
        nickname,
        free_usage_today: 0,
        free_daily_limit: FREE_DAILY_LIMIT
      }
    });

  } catch (error) {
    console.error('注册错误:', error);
    return res.status(500).json({ error: '服务器错误，请稍后重试' });
  }
};

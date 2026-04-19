/**
 * 用户登录接口
 * POST /api/auth/login
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

    const users = await getCollection('users');

    // 查找用户
    const user = await users.findOne({ nickname });
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 更新最后登录时间
    await users.updateOne(
      { _id: user._id },
      { $set: { last_login_at: new Date() } }
    );

    // 生成 Token
    const token = generateToken(user._id.toString(), user.nickname);

    // 记录日志
    await logUserAction(user._id, 'login', {});

    return res.status(200).json({
      success: true,
      message: '登录成功',
      token,
      user: {
        id: user._id.toString(),
        nickname: user.nickname,
        use_own_api: user.use_own_api,
        free_usage_today: user.free_usage_today || 0
      }
    });

  } catch (error) {
    console.error('登录错误:', error);
    return res.status(500).json({ error: '服务器错误，请稍后重试' });
  }
};

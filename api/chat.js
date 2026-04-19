/**
 * AI 对话接口（流式输出）
 * POST /api/chat
 * Body: { messages, function_used, conversation_id }
 * Headers: Authorization: Bearer <token>
 */

const { ObjectId } = require('mongodb');
const { getCollection } = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { checkAndUpdateQuota, getApiConfig, logUserAction } = require('../lib/ai');

// Prompt 模板
const PROMPTS = {
  '换位思考': `你是一位心理咨询师，帮助用户从对方的角度理解问题。

用户会描述一个让ta困扰的人际场景。你需要：

1. **100%代入对方视角**，用第一人称"我"来还原对方的真实想法和动机
2. **不美化不洗白**，如实呈现对方可能的自私、疏忽、压力等真实原因
3. **帮用户理解**为什么对方会这样做，即使对方的理由不够好

格式要求：
- 先用1-2句话共情用户的感受
- 然后用"如果我是[对方角色]，我可能是这样想的："开头
- 用第一人称详细还原对方的心理活动（3-5段）
- 最后给用户一个简短的宽慰或建议`,

  '停止灾难化': `你是一位认知行为治疗师，帮助用户识别和打破"灾难化思维"。

用户会描述一个让ta焦虑、担忧的事情。你需要：

1. **识别灾难化思维**：指出用户把事情往最坏方向想的模式
2. **概率分析**：帮用户客观评估"最坏情况"真的发生的可能性
3. **替代视角**：提供2-3个更可能发生的、没那么糟的情况
4. **应对方案**：即使最坏情况发生，也有什么应对办法

格式要求：
- 先共情用户的焦虑（1-2句话）
- 然后逐步引导用户看到：担忧 ≠ 现实
- 语气温和但有力，像一个睿智的朋友在开导你`
};

module.exports = async function handler(req, res) {
  // 设置 CORS 和 SSE
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
    // 验证登录
    const { user, error, status } = requireAuth(req);
    if (error) {
      return res.status(status).json({ error });
    }

    const userId = new ObjectId(user.userId);
    const { messages, function_used, conversation_id } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: '消息不能为空' });
    }

    // 检查额度
    const quota = await checkAndUpdateQuota(userId);
    if (!quota.allowed) {
      return res.status(429).json({
        error: quota.message,
        remaining: quota.remaining
      });
    }

    // 获取 API 配置
    const apiConfig = await getApiConfig(userId);

    // 构建消息列表
    let finalMessages = [...messages];

    // 如果使用特定功能，添加系统 Prompt
    if (function_used && PROMPTS[function_used]) {
      finalMessages = [
        { role: 'system', content: PROMPTS[function_used] },
        ...messages
      ];
    }

    // 记录开始时间
    const startTime = Date.now();

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 调用 AI API
    const response = await fetch(apiConfig.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.apiKey}`
      },
      body: JSON.stringify({
        model: apiConfig.model,
        messages: finalMessages,
        stream: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API 错误:', response.status, errorText);
      res.write(`data: ${JSON.stringify({ error: 'AI 服务暂时不可用' })}\n\n`);
      res.end();
      return;
    }

    // 流式转发响应
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
          } else {
            try {
              const json = JSON.parse(data);
              const content = json.choices?.[0]?.delta?.content || '';
              if (content) {
                fullResponse += content;
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    }

    res.end();

    // 记录日志（异步，不阻塞响应）
    const responseTime = Date.now() - startTime;
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();

    logUserAction(userId, 'chat_receive', {
      function_name: function_used || null,
      input_length: lastUserMessage?.content?.length || 0,
      output_length: fullResponse.length,
      response_time_ms: responseTime,
      api_source: apiConfig.source,
      model_used: apiConfig.model
    });

    // 保存对话到数据库
    saveConversation(userId, messages, fullResponse, function_used, conversation_id);

  } catch (error) {
    console.error('对话错误:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: '服务器错误，请稍后重试' });
    }
    res.write(`data: ${JSON.stringify({ error: '发生错误' })}\n\n`);
    res.end();
  }
};

/**
 * 保存对话到数据库（异步）
 */
async function saveConversation(userId, messages, aiResponse, functionUsed, conversationId) {
  try {
    const conversations = await getCollection('conversations');

    const lastUserMessage = messages.filter(m => m.role === 'user').pop();

    if (conversationId) {
      // 更新已有对话
      await conversations.updateOne(
        { _id: new ObjectId(conversationId), user_id: userId },
        {
          $push: {
            messages: {
              $each: [
                {
                  role: 'user',
                  content: lastUserMessage?.content || '',
                  function_used: functionUsed || null,
                  timestamp: new Date()
                },
                {
                  role: 'assistant',
                  content: aiResponse,
                  timestamp: new Date()
                }
              ]
            }
          },
          $set: { updated_at: new Date() }
        }
      );
    } else {
      // 创建新对话
      const title = (lastUserMessage?.content || '新对话').substring(0, 30);
      await conversations.insertOne({
        user_id: userId,
        title,
        messages: [
          {
            role: 'user',
            content: lastUserMessage?.content || '',
            function_used: functionUsed || null,
            timestamp: new Date()
          },
          {
            role: 'assistant',
            content: aiResponse,
            timestamp: new Date()
          }
        ],
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  } catch (error) {
    console.error('保存对话失败:', error);
  }
}

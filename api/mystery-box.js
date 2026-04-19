/**
 * 惊喜盲盒接口（流式输出）
 * POST /api/mystery-box
 * Body: { messages, conversation_id }
 * Headers: Authorization: Bearer <token>
 */

const { ObjectId } = require('mongodb');
const { getCollection } = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { checkAndUpdateQuota, getApiConfig, logUserAction } = require('../lib/ai');
const fs = require('fs');
const path = require('path');

// 加载 Prompt 配置
let promptsConfig = null;
function loadPrompts() {
  if (!promptsConfig) {
    const promptsPath = path.join(__dirname, 'prompts.json');
    promptsConfig = JSON.parse(fs.readFileSync(promptsPath, 'utf-8'));
  }
  return promptsConfig;
}

// 随机抽取 Prompt
function selectRandomPrompt(excludeIds = []) {
  const config = loadPrompts();
  const activePrompts = config.prompts.filter(p => p.active && !excludeIds.includes(p.id));

  if (activePrompts.length === 0) {
    // 如果全部排除了，重新从所有激活的里选
    const allActive = config.prompts.filter(p => p.active);
    return allActive[Math.floor(Math.random() * allActive.length)];
  }

  return activePrompts[Math.floor(Math.random() * activePrompts.length)];
}

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
    const { messages, conversation_id } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: '请先聊聊天，让我了解你的情况' });
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

    // 随机抽取 Prompt
    const selectedPrompt = selectRandomPrompt();

    // 汇总对话历史
    const conversationSummary = messages.map(m => {
      const prefix = m.role === 'user' ? '用户说：' : 'AI说：';
      return prefix + m.content;
    }).join('\n\n');

    // 构建最终消息
    const finalMessages = [
      {
        role: 'system',
        content: `你是「不内耗」的惊喜盲盒助手。用户刚刚抽到了一个思考视角，你需要用这个视角来分析用户的处境。

=== 用户抽到的视角 ===
分类：${selectedPrompt.categoryEmoji} ${selectedPrompt.categoryName}
问题：${selectedPrompt.displayQuestion}

=== 这个视角的分析框架 ===
${selectedPrompt.systemPrompt}

=== 输出要求 ===
1. 先用 1-2 句话点明你理解的用户核心困扰
2. 用这个视角给出你的分析（这是重点，要有洞察力）
3. 结尾给一个可以带走的启发或问题

=== 风格要求 ===
- 语气温暖但不说教，像一个有智慧的朋友
- 分析要具体，不要泛泛而谈
- 如果这个视角戳中了用户的盲区，要温柔地指出来
- 长度适中，400-600字`
      },
      {
        role: 'user',
        content: `以下是用户的对话内容：\n\n${conversationSummary}\n\n请用「${selectedPrompt.categoryName}」的视角来分析。`
      }
    ];

    // 记录开始时间
    const startTime = Date.now();

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 先发送抽到的 Prompt 信息
    res.write(`data: ${JSON.stringify({
      type: 'prompt_info',
      prompt: {
        id: selectedPrompt.id,
        category: selectedPrompt.category,
        categoryName: selectedPrompt.categoryName,
        categoryEmoji: selectedPrompt.categoryEmoji,
        color: selectedPrompt.color,
        displayQuestion: selectedPrompt.displayQuestion
      }
    })}\n\n`);

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
            // 发送完成信号
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

    logUserAction(userId, 'mystery_box', {
      prompt_id: selectedPrompt.id,
      prompt_category: selectedPrompt.category,
      input_length: conversationSummary.length,
      output_length: fullResponse.length,
      response_time_ms: responseTime,
      api_source: apiConfig.source,
      model_used: apiConfig.model,
      conversation_id: conversation_id || null
    });

  } catch (error) {
    console.error('盲盒错误:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: '服务器错误，请稍后重试' });
    }
    res.write(`data: ${JSON.stringify({ error: '发生错误' })}\n\n`);
    res.end();
  }
};

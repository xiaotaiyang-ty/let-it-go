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

// Prompt 模板（来自 v3 深夜书房版）
const PROMPTS = {
  '换位思考': `你是一个帮助用户换位思考的分析助手。用户刚刚向你倾诉了一件让ta困扰的事情。

【你的任务】
完全代入对方的角色，用第一人称「我」，真实还原对方当时的想法。

【核心原则 - 真实还原】
- 100% 代入对方
- 全程用第一人称「我」
- 只讲对方真实可能的想法：
  1) 我当时听到/看到了什么
  2) 我当时的感受（委屈、生气、无奈、压力、着急...）
  3) 我为什么会那样说/那样做
  4) 我有什么难处、顾虑、利益考量
- 不辩解，不洗白，只还原真实动机
- 可以承认「我」做得不够好的地方
- 可以表达「我」的局限和无奈

【输出格式】
用自然语言输出，按以下结构组织：

---

## 🔄 如果我是「{对方称呼}」

### 当时的情况（我看到/听到的）
[用第一人称描述对方当时接收到的信息]

### 我当时在想什么
[用第一人称还原对方的内心想法，包括感受和考量]

### 我为什么那样做
[用第一人称解释对方的行为动机]

### 我的难处
[如果有的话，用第一人称说出对方可能的压力/顾虑/局限]

---

💭 **一点补充**：以上是基于你的描述做的还原，真实情况可能更复杂。如果想继续聊聊，随时说。`,

  '停止灾难化': `你是一个帮助用户停止灾难化思维的心理陪伴助手。用户刚刚向你倾诉了一件让ta焦虑的事情，现在需要你帮ta跳出焦虑循环。

【你的任务】
基于用户的倾诉内容，一次性给出有说服力的深度开导。不要追问，直接分析。

【你的角色定位】
- 你是一个温暖但有洞察力的朋友
- 你能看穿用户的思维陷阱，并温和地指出来
- 你不是敷衍安慰，而是用逻辑和事实帮用户看清现实

【分析框架】
从以下维度展开，选择最相关的 3-4 个：

1. **猜中灾难化想法**：说出用户可能在脑子里反复转的最坏想法（3-5个）

2. **现实检验**：这件事客观上有多严重？
   - 用具体的逻辑分析
   - 可以用类比帮助用户看清
   - 可以反问："你上周还记得谁出过什么错吗？"

3. **概率分析**：最坏情况发生的概率有多大？
   - 分析需要哪些条件同时满足
   - 指出这些条件同时满足的概率其实很低

4. **认知纠偏**：用户陷入了什么思维陷阱？
   - 常见陷阱：读心术（猜测别人想法）、灾难化（小事想成大事）、过度概括（一次失败=永远失败）
   - 温和指出，不说教，引导用户自己发现

5. **历史经验**：引导用户回忆过去类似的担心，后来都没发生

6. **当下聚焦**：如果能行动，给具体建议；如果无法行动，引导接受并放下

【输出格式】
用自然语言输出，段落清晰，有小标题。内容要充分（400-800字），这是核心价值所在。

【语气要求】
- 像一个很懂你的朋友
- 可以适度用 emoji，但不要太多
- 说话要有分量，不是敷衍安慰
- 长段落要分段

【禁止说的话】
- "别想太多" "你想太多了"
- "没什么大不了的"
- "一切都会好的"
- "你应该..."

【输出结构示例】

---

## ☀️ 来，我们一起看看这件事

### 我猜你脑子里可能在转这些
• [最坏想法1]
• [最坏想法2]
• [最坏想法3]

是这些吗？

### 现实检验：这件事到底有多严重？
[具体分析...]

### 你可能陷入了一个思维陷阱
[指出思维陷阱...]

### 最坏情况的概率
[概率分析...]

### 你可以做什么
[具体建议或引导放下...]

---

想继续聊聊吗？或者还有什么放不下的？`
};

// 惊喜盲盒 - 6个视角随机抽取
const MYSTERY_BOX_PROMPTS = [
  {
    name: '人生电影院',
    emoji: '🎬',
    question: '如果你的人生是一部电影，观众会怎么看这一幕？',
    prompt: `你是一个富有洞察力的电影评论家。请用「电影」的视角帮用户获得新的洞察。

【第一幕：观众视角】
假设用户的人生是一部电影，你是坐在影院里的观众。作为观众，你最想冲进屏幕里对主角喊的一句话是什么？为什么？

【第二幕：电影类型】
这个处境最像什么类型的电影？悬疑片、青春成长片、黑色幽默片、还是励志片？这暗示了什么？

【第三幕：电影标题】
给这段经历取一个电影标题，它暗示了用户把自己放在什么位置？

要求：语气温暖有洞察力，结尾给一个核心启发。`
  },
  {
    name: '时间旅行者',
    emoji: '⏰',
    question: '站在不同时间点回看现在，会看到什么？',
    prompt: `你是一个能够穿越时间的智者。请带用户进行一次时间旅行。

【20年后的同学聚会】
想象20年后，用户会如何描述现在这个坎？会说自己是怎么走过来的？

【2-3年后的复盘】
假设这件事最终被证明不重要，最可能是因为哪些现在「合理化」的假设？

【时间的礼物】
当下的困扰，放在时间长河里，真实重量是多少？

要求：具体描述场景，温柔指出盲区，结尾给核心启发。`
  },
  {
    name: '名人圆桌会',
    emoji: '👥',
    question: '如果5位名人来评价你的处境，他们会怎么说？',
    prompt: `你是「名人圆桌会」主持人。请邀请5位不同领域的名人来评价用户的处境。

【要求】
- 5位名人来自不同领域（商业、心理学、文学、哲学、娱乐等）
- 每位的评价要符合ta的思维风格
- 格式：🎤 名人（领域）+ 一句话评价 + 解释

【最后总结】
这5个视角的共同点和分歧？推荐哪个视角？

要求：评价要有洞察力，不是泛泛的鸡汤。`
  },
  {
    name: '被讨厌的勇气',
    emoji: '📚',
    question: '阿德勒心理学会如何解读你的困扰？',
    prompt: `你是精通阿德勒心理学的咨询师。请用《被讨厌的勇气》的理论分析。

【课题分离】
哪些是用户的课题？哪些是别人的课题？用户是否在背负别人的课题？

【目的论】
用户的焦虑在帮ta达成什么隐藏目的？如果选择不需要这个情绪，需要面对什么？

【阿德勒会说】
如果阿德勒坐在用户对面，他会说什么？

要求：理论准确但语言通俗，基于具体情况分析。`
  },
  {
    name: '逆向工程师',
    emoji: '🔮',
    question: '如果要让这件事100%失败，需要做什么？',
    prompt: `你是擅长逆向思维的策略师。

【设计失败】
如果想让这件事100%失败，需要做哪5件事？

【照镜子】
用户现在有没有在不自觉地执行这些「必败策略」？

【预演最坏】
假设最担心的结果发生了，一周后、一个月后、一年后会怎样？真有那么灾难吗？

【反转策略】
做好哪1-2件事能大幅提高成功率？

要求：必败策略要有洞察力，让用户感到被看穿。`
  },
  {
    name: '平行宇宙',
    emoji: '🌌',
    question: '其他版本的「你」会怎么处理这件事？',
    prompt: `你是能观测平行宇宙的旅行者。

【平行宇宙A：完全相反的你】
性格完全相反的ta遇到同样处境，会怎么想、怎么做？

【平行宇宙B：10年后的你】
带着10年智慧穿越回来的ta，会告诉现在的自己什么？

【平行宇宙C：最勇敢的你】
做出最勇敢选择的ta，那个选择是什么？什么在阻止现实中的用户？

【穿越回来】
用户想借用哪个版本的什么特质？

要求：描述要生动，帮用户看到更多可能性。`
  }
];

function getRandomMysteryPrompt() {
  return MYSTERY_BOX_PROMPTS[Math.floor(Math.random() * MYSTERY_BOX_PROMPTS.length)];
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
    let mysteryBoxInfo = null; // 盲盒信息

    // 如果使用特定功能，将对话汇总后发送（参考 v3 深夜书房版）
    if (function_used && PROMPTS[function_used]) {
      // 汇总对话历史
      const conversationSummary = messages.map(m => {
        const prefix = m.role === 'user' ? '用户说：' : 'AI说：';
        return prefix + m.content;
      }).join('\n\n');

      // 构建分析请求
      const promptText = function_used === '换位思考'
        ? `以下是用户的倾诉内容：\n\n${conversationSummary}\n\n请帮用户进行换位思考分析。`
        : `以下是用户的倾诉内容：\n\n${conversationSummary}\n\n请帮用户停止灾难化思维，给出深度开导。`;

      finalMessages = [
        { role: 'system', content: PROMPTS[function_used] },
        { role: 'user', content: promptText }
      ];
    } else if (function_used === '惊喜盲盒') {
      // 惊喜盲盒：随机抽取视角
      const selected = getRandomMysteryPrompt();
      mysteryBoxInfo = {
        name: selected.name,
        emoji: selected.emoji,
        question: selected.question
      };

      const conversationSummary = messages.map(m => {
        const prefix = m.role === 'user' ? '用户说：' : 'AI说：';
        return prefix + m.content;
      }).join('\n\n');

      finalMessages = [
        { role: 'system', content: selected.prompt },
        { role: 'user', content: `以下是用户的倾诉内容：\n\n${conversationSummary}\n\n请用「${selected.name}」的视角来分析。` }
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
            // 先保存对话，获取 conversation_id
            const newConvId = await saveConversation(userId, messages, fullResponse, function_used, conversation_id);
            // 发送 conversation_id 给前端
            if (newConvId) {
              res.write(`data: ${JSON.stringify({ conversation_id: newConvId })}\n\n`);
            }
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
 * 保存对话到数据库
 */
async function saveConversation(userId, messages, aiResponse, functionUsed, conversationId) {
  try {
    const conversations = await getCollection('conversations');

    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    let newConversationId = conversationId;

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
          $set: {
            updated_at: new Date(),
            last_message: aiResponse.substring(0, 100)
          }
        }
      );
    } else {
      // 创建新对话
      const title = (lastUserMessage?.content || '新对话').substring(0, 30);
      const result = await conversations.insertOne({
        user_id: userId,
        title,
        last_message: aiResponse.substring(0, 100),
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
      newConversationId = result.insertedId.toString();
    }

    return newConversationId;
  } catch (error) {
    console.error('保存对话失败:', error);
    return null;
  }
}

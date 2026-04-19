/**
 * 惊喜盲盒接口（流式输出）
 * POST /api/mysterybox
 * Body: { messages, conversation_id }
 * Headers: Authorization: Bearer <token>
 */

const { ObjectId } = require('mongodb');
const { getCollection } = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { checkAndUpdateQuota, getApiConfig, logUserAction } = require('../lib/ai');

// Prompt 配置（内嵌，避免文件加载问题）
const PROMPTS = [
  {
    id: 'movie_001',
    category: 'movie',
    categoryName: '人生电影院',
    categoryEmoji: '🎬',
    color: '#FF6B6B',
    displayQuestion: '如果你的人生是一部电影，观众会怎么看这一幕？',
    systemPrompt: `你是一个富有洞察力的电影评论家，同时也是一个温暖的朋友。用户正在经历一些困扰，请你用「电影」的视角帮 ta 获得新的洞察。

请依次完成以下分析：

【第一幕：观众视角】
假设用户的人生是一部电影，你是坐在影院里的观众，刚刚看到了用户描述的这一幕。
作为观众，你最想冲进屏幕里对主角喊的一句话是什么？为什么？

【第二幕：电影类型】
如果把用户现在的处境拍成一部电影，它最像什么类型？
- 悬疑片（主角以为的真相可能不是真相）
- 青春成长片（这是必经的阵痛）
- 黑色幽默片（其实挺荒诞的）
- 励志片（困境是转折点的前奏）

这个类型暗示了什么？给主角什么启发？

【第三幕：电影标题】
如果要给这段经历取一个电影标题，你会叫它什么？
这个标题暗示了用户把自己放在什么位置（受害者？英雄？配角？导演？）
如果换一个标题，故事会怎么不同？

要求：
- 语气温暖但有洞察力，像一个懂电影也懂人心的朋友
- 每个部分都要基于用户的具体情况，不要泛泛而谈
- 结尾给一个可以带走的核心启发`
  },
  {
    id: 'time_002',
    category: 'time',
    categoryName: '时间旅行者',
    categoryEmoji: '⏰',
    color: '#4ECDC4',
    displayQuestion: '如果你能穿越时间，站在不同时间点回看现在，会看到什么？',
    systemPrompt: `你是一个能够穿越时间的智者。用户正陷在当下的困扰中，请你带 ta 进行一次时间旅行，获得新的视角。

请依次完成以下分析：

【未来视角：20年后的同学聚会】
想象 20 年后，用户在同学聚会上遇到多年未见的老友。
- ta 会如何描述现在过不去的这个坎？
- ta 会说自己是怎么走过来的？
- 站在时代巨变后回望，ta 会如何评价今天的处境和选择？

【另一个未来：2-3年后的失败复盘】
假设 2-3 年后，用户现在纠结的这件事最终失败了，或被证明根本不重要。
失败最可能不是因为能力不足，而是因为哪三种 ta 现在正在「合理化」的行为或假设？

【时间的礼物】
综合以上两个视角，时间想告诉用户什么？
当下的困扰，放在时间的长河里，它的真实重量是多少？

要求：
- 具体描述场景，让用户能「看见」那个未来
- 指出用户可能没意识到的盲区，但语气要温柔
- 结尾给一个可以带走的核心启发`
  },
  {
    id: 'celebrity_003',
    category: 'celebrity',
    categoryName: '名人圆桌会',
    categoryEmoji: '👥',
    color: '#9B59B6',
    displayQuestion: '如果 5 位不同领域的名人来评价你的处境，他们会怎么说？',
    systemPrompt: `你要扮演一个「名人圆桌会」的主持人。请根据用户的具体处境，邀请 5 位来自不同领域、各有独特思维框架的名人来评价。

【圆桌嘉宾要求】
- 5 位名人要来自不同领域（如：商业、心理学、文学、哲学、娱乐、科技、体育等）
- 每位名人的评价要符合 ta 的思维方式和作品风格
- 评价可以是正面、中性或负面的——关键是要有洞察力
- 选择的名人要和用户的困扰有某种契合度

【输出格式】
为每位名人写一段评价，格式如下：

🎤 [名人名字]（领域/代表作）
"[名人风格的一句话评价]"
[2-3句解释：为什么这位名人会这么说？ta 的思维框架是什么？这个视角对用户有什么启发？]

【最后总结】
这 5 个视角有什么共同点？有什么分歧？
如果用户要从中选一个视角来指导自己，你会推荐哪个？为什么？

要求：
- 名人的评价要具体、有洞察力，不是泛泛的鸡汤
- 体现不同思维框架的碰撞
- 让用户感受到「原来可以这样看问题」`
  },
  {
    id: 'adler_004',
    category: 'psychology',
    categoryName: '被讨厌的勇气',
    categoryEmoji: '📚',
    color: '#F39C12',
    displayQuestion: '阿德勒心理学会如何解读你的困扰？',
    systemPrompt: `你是一位精通阿德勒心理学的温暖咨询师。请用《被讨厌的勇气》中的核心理论，帮助用户获得新的视角。

请依次用以下三个框架分析用户的处境：

【框架一：课题分离】
用户现在纠结的这件事里：
- 哪些是「用户的课题」（用户能控制、应该负责的）？
- 哪些是「别人的课题」（用户无法也不应该控制的）？
- 用户是否在不自觉地背负别人的课题？
- 如果真正做到课题分离，用户会轻松多少？

【框架二：目的论】
阿德勒认为情绪和行为都是有「目的」的，而不是被过去「原因」驱动的。
- 用户现在的焦虑/纠结/拖延，在帮 ta 达成什么隐藏的目的？
- 如果没有这个情绪，用户会失去什么「好处」？
- 如果用户「选择」不再需要这个情绪，ta 需要面对什么？

【框架三：共同体感觉】
- 用户在这件事中，如何定义自己和他人的关系？
- ta 是在「竞争」还是在「合作」？
- 如果用户把关注点从「被别人认可」转向「对他人有贡献」，这件事会有什么不同？

【阿德勒会说】
最后，用一段话总结：如果阿德勒本人坐在用户对面，他会对用户说什么？

要求：
- 理论要准确，但语言要通俗，不要掉书袋
- 分析要基于用户的具体情况，不是套模板
- 语气温暖但有洞察力，像一个真正理解阿德勒的朋友`
  },
  {
    id: 'reverse_005',
    category: 'reverse',
    categoryName: '逆向工程师',
    categoryEmoji: '🔮',
    color: '#3498DB',
    displayQuestion: '如果要让这件事 100% 失败，你需要做什么？',
    systemPrompt: `你是一个擅长「逆向思维」的策略师。用户正陷在对某件事的担忧和纠结中，请你用「逆向工程」的方法帮 ta 获得洞察。

【第一步：设计失败】
如果用户想让这件事 100% 失败，ta 需要做哪 5 件事？
请列出 5 个「必败策略」，并解释为什么这些策略一定会导致失败。

【第二步：照镜子】
用户现在的行为里，有没有哪些其实在不自觉地执行这些「必败策略」？
请具体指出（如果有的话），语气要温柔但诚实。

【第三步：预演最坏结果】
假设用户最担心的那个结果真的发生了：
- 一周后，用户的生活会是什么样子？
- 一个月后呢？
- 一年后呢？
这个「灾难」真的像用户想象中那么灾难吗？还是其实没那么不可承受？

【第四步：反转策略】
把「必败策略」反过来，什么是「必成策略」？
用户只需要做好哪 1-2 件事，就能大幅提高成功概率？

要求：
- 「必败策略」要具体、有洞察力，让用户感到「被看穿了」
- 预演最坏结果时要诚实但温暖，帮用户减轻灾难化思维
- 最后的策略要可执行，不是泛泛的建议`
  },
  {
    id: 'parallel_006',
    category: 'parallel',
    categoryName: '平行宇宙',
    categoryEmoji: '🌌',
    color: '#1ABC9C',
    displayQuestion: '在无数个平行宇宙里，其他版本的「你」会怎么处理这件事？',
    systemPrompt: `你是一个能够观测平行宇宙的旅行者。在无数个平行宇宙里，存在着不同版本的用户——他们有着不同的性格、不同的人生经历、不同的价值观。请带用户看看，其他版本的「自己」会怎么处理当前的困境。

【平行宇宙 A：完全相反的你】
在这个宇宙里，有一个和用户性格完全相反的「ta」。
- 如果用户谨慎，这个 ta 就莽撞
- 如果用户在意别人看法，这个 ta 就完全不在乎
- 如果用户容易焦虑，这个 ta 就迷之自信

这个「完全相反的 ta」遇到同样的处境，会怎么想？怎么做？结果可能是什么？

【平行宇宙 B：10 年后的你】
在这个宇宙里，是 10 年后的用户穿越回来，带着 10 年的智慧和阅历。
- 这个「未来的 ta」会如何看待现在的困境？
- ta 会告诉现在的自己什么？
- ta 最想阻止现在的自己做什么？

【平行宇宙 C：最勇敢的你】
在这个宇宙里，用户做出了最勇敢的选择——不是最安全的，而是内心真正想要的。
- 那个选择是什么？
- 为什么现实中的用户没有做出这个选择？
- 什么在阻止 ta？

【穿越回来】
看过这三个平行宇宙后，用户想借用哪个版本的自己的什么特质？
不需要变成那个人，只是借用一点点。

要求：
- 每个平行宇宙的描述要具体、生动
- 帮用户看到自己的更多可能性，而不是否定现在的自己
- 结尾的启发要温暖、可行动`
  }
];

// 随机抽取 Prompt
function selectRandomPrompt() {
  return PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
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

    // 记录日志
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

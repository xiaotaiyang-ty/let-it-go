/**
 * 聊天模块
 */

const Chat = {
  messages: [],        // 当前对话消息
  conversationId: null, // 当前对话 ID
  isStreaming: false,  // 是否正在流式输出

  /**
   * 初始化
   */
  init() {
    this.bindEvents();
    this.loadMessages();
  },

  /**
   * 绑定事件
   */
  bindEvents() {
    // 发送按钮
    document.getElementById('sendBtn').addEventListener('click', () => {
      this.sendMessage();
    });

    // 输入框回车发送
    const input = document.getElementById('userInput');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // 自动调整输入框高度
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // 功能按钮
    document.getElementById('perspectiveBtn').addEventListener('click', () => {
      this.sendWithFunction('换位思考');
    });

    document.getElementById('positiveBtn').addEventListener('click', () => {
      this.sendWithFunction('停止灾难化');
    });

    // 新对话按钮
    document.getElementById('newChatBtn').addEventListener('click', () => {
      this.startNewChat();
    });
  },

  /**
   * 加载消息（从本地缓存）
   */
  loadMessages() {
    this.messages = Storage.getMessages();
    this.conversationId = Storage.getConversationId();

    if (this.messages.length > 0) {
      this.hideWelcome();
      this.messages.forEach(msg => {
        this.appendMessage(msg.role, msg.content, false);
      });
      this.scrollToBottom();
    }
  },

  /**
   * 发送消息
   */
  async sendMessage(functionUsed = null) {
    if (!Auth.isLoggedIn()) {
      Auth.showLoginModal();
      return;
    }

    const input = document.getElementById('userInput');
    const content = input.value.trim();

    if (!content || this.isStreaming) return;

    // 清空输入框
    input.value = '';
    input.style.height = 'auto';

    // 隐藏欢迎区域
    this.hideWelcome();

    // 添加用户消息
    this.messages.push({ role: 'user', content });
    this.appendMessage('user', content);

    // 显示加载
    this.showLoading();
    this.isStreaming = true;

    // 准备 AI 消息容器
    const aiMessageEl = this.appendMessage('assistant', '', true);
    const contentEl = aiMessageEl.querySelector('.message-content');
    let fullContent = '';

    // 发送请求
    await API.chatStream(
        this.messages.map(m => ({ role: m.role, content: m.content })),
        functionUsed,
        this.conversationId,
        // onChunk
        (chunk) => {
          fullContent += chunk;
          contentEl.innerHTML = this.formatContent(fullContent) + '<span class="streaming-cursor">|</span>';
          this.scrollToBottom();
        },
        // onDone
        () => {
          this.isStreaming = false;
          this.hideLoading();
          contentEl.innerHTML = this.formatContent(fullContent);

          // 保存消息
          this.messages.push({ role: 'assistant', content: fullContent });
          Storage.saveMessages(this.messages);

          // 刷新用户额度显示
          Auth.refreshUserInfo();
        },
        // onError
        (error) => {
          this.isStreaming = false;
          this.hideLoading();
          contentEl.innerHTML = `<span style="color: #ef4444;">抱歉，出了点问题：${error.message}</span>`;
          showError(error.message);
        }
    );
  },

  /**
   * 使用功能按钮发送
   */
  sendWithFunction(functionName) {
    const input = document.getElementById('userInput');
    if (!input.value.trim()) {
      showError('请先输入你的情况，再点击功能按钮');
      input.focus();
      return;
    }
    this.sendMessage(functionName);
  },

  /**
   * 开始新对话
   */
  startNewChat() {
    this.messages = [];
    this.conversationId = null;
    Storage.clearCurrentSession();

    // 清空聊天区域
    const container = document.getElementById('chatContainer');
    container.innerHTML = '';

    // 显示欢迎区域
    this.showWelcome();
  },

  /**
   * 添加消息到界面
   */
  appendMessage(role, content, isStreaming = false) {
    const container = document.getElementById('chatContainer');

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role === 'user' ? 'user-message' : 'ai-message'}`;
    messageDiv.style.position = 'relative';

    // 为 AI 消息添加收藏按钮
    if (role === 'assistant') {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'message-actions';
      actionsDiv.innerHTML = `
        <button class="save-btn" title="收藏这条回复" onclick="Chat.saveQuote(this)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
          </svg>
        </button>
      `;
      messageDiv.appendChild(actionsDiv);
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = isStreaming ? '' : this.formatContent(content);
    contentDiv.dataset.content = content; // 存储原始内容用于收藏

    messageDiv.appendChild(contentDiv);
    container.appendChild(messageDiv);

    this.scrollToBottom();
    return messageDiv;
  },

  /**
   * 格式化内容（简单 Markdown）
   */
  formatContent(text) {
    if (!text) return '';

    return text
        // 标题
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        // 粗体
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // 斜体
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // 换行
        .replace(/\n/g, '<br>');
  },

  /**
   * 显示加载指示器
   */
  showLoading() {
    const loadingTexts = [
      "正在认真读你说的话",
      "让我想想怎么回答",
      "稍等，我在思考",
      "嗯，我理解了",
      "给我一点时间"
    ];
    const text = loadingTexts[Math.floor(Math.random() * loadingTexts.length)];
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingIndicator').style.display = 'block';
  },

  /**
   * 隐藏加载指示器
   */
  hideLoading() {
    document.getElementById('loadingIndicator').style.display = 'none';
  },

  /**
   * 显示欢迎区域
   */
  showWelcome() {
    const container = document.getElementById('chatContainer');
    container.innerHTML = `
      <div class="welcome-section" id="welcomeSection">
        <div class="welcome-icon">🌿</div>
        <h2 class="welcome-title">有什么想说的？</h2>
        <p class="welcome-subtitle">我在听，随便聊聊吧</p>
      </div>
    `;
  },

  /**
   * 隐藏欢迎区域
   */
  hideWelcome() {
    const welcome = document.getElementById('welcomeSection');
    if (welcome) {
      welcome.remove();
    }
  },

  /**
   * 滚动到底部
   */
  scrollToBottom() {
    const container = document.getElementById('chatContainer');
    container.scrollTop = container.scrollHeight;
  },

  /**
   * 收藏金句
   */
  async saveQuote(btn) {
    if (!Auth.isLoggedIn()) {
      Auth.showLoginModal();
      return;
    }

    // 获取消息内容
    const messageEl = btn.closest('.ai-message');
    const contentEl = messageEl.querySelector('.message-content');
    const content = contentEl.dataset.content || contentEl.innerText;

    // 检查是否已收藏
    if (btn.classList.contains('saved')) {
      return;
    }

    try {
      const result = await API.post('/api/quotes', {
        quote: content,
        source: 'AI回复'
      });

      // 更新按钮状态
      btn.classList.add('saved');
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--warm-orange)" stroke="var(--warm-orange)" stroke-width="2">
          <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
        </svg>
      `;

      // 显示成功提示
      this.showSaveToast();
    } catch (error) {
      if (error.message === '已经收藏过了') {
        btn.classList.add('saved');
      } else {
        showError('收藏失败: ' + error.message);
      }
    }
  },

  /**
   * 显示收藏成功提示
   */
  showSaveToast() {
    const toast = document.getElementById('saveToast');
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }
};

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', () => {
  // 等待 Auth 初始化完成
  setTimeout(() => {
    Chat.init();
  }, 100);
});

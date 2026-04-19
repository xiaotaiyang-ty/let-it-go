/**
 * 聊天模块
 */

const Chat = {
  messages: [],        // 当前对话消息
  conversationId: null, // 当前对话 ID
  isStreaming: false,  // 是否正在流式输出
  selectedText: '',    // 当前选中的文本
  selectedMessageContent: null, // 选中文本所在消息的完整内容

  /**
   * 初始化
   */
  init() {
    this.bindEvents();
    this.initSelectionToolbar();
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
   * 初始化选中文字工具条
   */
  initSelectionToolbar() {
    const toolbar = document.getElementById('selectionToolbar');
    if (!toolbar) return;

    // 监听选中事件
    document.addEventListener('mouseup', (e) => {
      // 延迟执行，等待选区稳定
      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection.toString().trim();

        // 检查是否在 AI 消息中选中了文字
        if (text && text.length > 0) {
          const range = selection.getRangeAt(0);
          const messageEl = range.commonAncestorContainer.nodeType === 1
            ? range.commonAncestorContainer.closest('.ai-message')
            : range.commonAncestorContainer.parentElement?.closest('.ai-message');

          if (messageEl) {
            this.selectedText = text;
            // 尝试获取消息的完整内容
            const contentEl = messageEl.querySelector('.message-content');
            this.selectedMessageContent = contentEl ? contentEl.textContent : null;

            // 显示工具条
            const rect = range.getBoundingClientRect();
            toolbar.style.display = 'flex';
            toolbar.style.left = `${rect.left + rect.width / 2 - toolbar.offsetWidth / 2}px`;
            toolbar.style.top = `${rect.top - toolbar.offsetHeight - 8}px`;

            // 防止超出屏幕
            const toolbarRect = toolbar.getBoundingClientRect();
            if (toolbarRect.left < 10) {
              toolbar.style.left = '10px';
            }
            if (toolbarRect.right > window.innerWidth - 10) {
              toolbar.style.left = `${window.innerWidth - toolbarRect.width - 10}px`;
            }
            if (toolbarRect.top < 10) {
              toolbar.style.top = `${rect.bottom + 8}px`;
            }

            return;
          }
        }

        // 如果没有有效选中，隐藏工具条
        if (!e.target.closest('.selection-toolbar')) {
          toolbar.style.display = 'none';
          this.selectedText = '';
          this.selectedMessageContent = null;
        }
      }, 10);
    });

    // 点击其他地方隐藏工具条
    document.addEventListener('mousedown', (e) => {
      if (!e.target.closest('.selection-toolbar')) {
        toolbar.style.display = 'none';
      }
    });

    // 收藏选中文字
    document.getElementById('selectionSaveBtn').addEventListener('click', () => {
      if (this.selectedText) {
        this.saveQuote(this.selectedText);
        toolbar.style.display = 'none';
        window.getSelection().removeAllRanges();
      }
    });

    // 复制选中文字
    document.getElementById('selectionCopyBtn').addEventListener('click', () => {
      if (this.selectedText) {
        navigator.clipboard.writeText(this.selectedText).then(() => {
          this.showSaveToast('已复制 ✓');
        });
        toolbar.style.display = 'none';
        window.getSelection().removeAllRanges();
      }
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
      (newConversationId) => {
        this.isStreaming = false;
        this.hideLoading();

        // 渲染最终内容并添加收藏按钮
        this.finalizeMessage(aiMessageEl, fullContent);

        // 保存 conversation_id
        if (newConversationId && !this.conversationId) {
          this.conversationId = newConversationId;
          Storage.setConversationId(newConversationId);
        }

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

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = isStreaming ? '' : this.formatContent(content);

    messageDiv.appendChild(contentDiv);

    // 非流式的 AI 消息添加收藏按钮
    if (role === 'assistant' && !isStreaming && content) {
      this.addMessageActions(messageDiv, content);
    }

    container.appendChild(messageDiv);
    this.scrollToBottom();
    return messageDiv;
  },

  /**
   * 完成流式消息（添加收藏按钮）
   */
  finalizeMessage(messageEl, content) {
    const contentEl = messageEl.querySelector('.message-content');
    if (contentEl) {
      contentEl.innerHTML = this.formatContent(content);
    }
    this.addMessageActions(messageEl, content);
  },

  /**
   * 为消息添加操作按钮
   */
  addMessageActions(messageEl, content) {
    // 检查是否已有操作区
    if (messageEl.querySelector('.message-actions')) return;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'message-save-btn';
    saveBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
      </svg>
      收藏
    `;
    saveBtn.onclick = (e) => {
      e.stopPropagation();
      // 检查是否有选中的文字
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();

      if (selectedText && messageEl.contains(selection.anchorNode)) {
        // 收藏选中的文字
        this.saveQuote(selectedText);
      } else {
        // 收藏整条消息（截取前200字）
        let textToSave = content.substring(0, 200);
        if (content.length > 200) {
          textToSave += '...';
        }
        this.saveQuote(textToSave);
      }
    };

    actionsDiv.appendChild(saveBtn);
    messageEl.appendChild(actionsDiv);
  },

  /**
   * 收藏金句
   */
  async saveQuote(text) {
    if (!text) {
      showError('没有可收藏的内容');
      return;
    }

    try {
      await API.post('/api/quotes', {
        quote: text,
        source: '来自对话'
      });
      this.showSaveToast('已收藏 ✨');
    } catch (error) {
      if (error.message.includes('已经收藏')) {
        this.showSaveToast('已经收藏过了');
      } else {
        showError(error.message || '收藏失败');
      }
    }
  },

  /**
   * 显示收藏提示
   */
  showSaveToast(message = '已收藏') {
    const toast = document.getElementById('saveToast');
    const textEl = document.getElementById('saveToastText');
    if (textEl) {
      textEl.textContent = message;
    }
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
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
  }
};

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', () => {
  // 等待 Auth 初始化完成
  setTimeout(() => {
    Chat.init();
  }, 100);
});

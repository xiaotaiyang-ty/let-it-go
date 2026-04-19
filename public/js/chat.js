/**
 * 聊天模块
 */

const Chat = {
  messages: [],        // 当前对话消息
  conversationId: null, // 当前对话 ID
  isStreaming: false,  // 是否正在流式输出
  selectedText: '',    // 当前选中的文本
  selectedMessageContent: null, // 选中文本所在消息的完整内容
  userScrolledUp: false, // 用户是否主动向上滚动了

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

    // 功能按钮 - 基于已有对话或输入框内容
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

    // 清除对话按钮
    document.getElementById('clearChatBtn').addEventListener('click', () => {
      this.clearCurrentMessages();
    });

    // 惊喜盲盒按钮
    document.getElementById('mysteryBoxBtn').addEventListener('click', () => {
      this.openMysteryBox();
    });

    // 监听聊天区域滚动，判断用户是否主动向上滚动
    const container = document.getElementById('chatContainer');
    container.addEventListener('scroll', () => {
      if (this.isStreaming) {
        // 检查是否滚动到底部附近（允许50px误差）
        const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
        this.userScrolledUp = !isAtBottom;
      }
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

    // 如果没有输入内容，且没有历史消息，提示用户
    if (!content && this.messages.length === 0) {
      showError('请先输入你的情况');
      input.focus();
      return;
    }

    if (this.isStreaming) return;

    // 重置滚动状态
    this.userScrolledUp = false;

    // 如果有输入内容，添加用户消息
    if (content) {
      // 清空输入框
      input.value = '';
      input.style.height = 'auto';

      // 隐藏欢迎区域
      this.hideWelcome();

      // 添加用户消息
      this.messages.push({ role: 'user', content });
      this.appendMessage('user', content);
    }

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
        // 智能滚动：只有用户没有主动向上滚动时才自动滚动
        if (!this.userScrolledUp) {
          this.scrollToBottom();
        }
      },
      // onDone
      (newConversationId) => {
        this.isStreaming = false;
        this.userScrolledUp = false;
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

        // 完成后滚动到底部
        this.scrollToBottom();
      },
      // onError
      (error) => {
        this.isStreaming = false;
        this.userScrolledUp = false;
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
    const inputContent = input.value.trim();

    // 如果输入框有内容，先把内容作为用户消息添加
    if (inputContent) {
      // 清空输入框
      input.value = '';
      input.style.height = 'auto';

      // 隐藏欢迎区域
      this.hideWelcome();

      // 添加用户消息
      this.messages.push({ role: 'user', content: inputContent });
      this.appendMessage('user', inputContent);
      Storage.saveMessages(this.messages);
    }

    // 检查是否有对话可以分析
    if (this.messages.length === 0) {
      showError('请先聊聊你的情况，再使用这个功能');
      input.focus();
      return;
    }

    // 基于已有对话发送功能请求
    this.sendFunctionRequest(functionName);
  },

  /**
   * 发送功能分析请求（基于已有对话）
   */
  async sendFunctionRequest(functionName) {
    if (!Auth.isLoggedIn()) {
      Auth.showLoginModal();
      return;
    }

    if (this.isStreaming) return;

    // 重置滚动状态
    this.userScrolledUp = false;

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
      functionName,
      this.conversationId,
      // onChunk
      (chunk) => {
        fullContent += chunk;
        contentEl.innerHTML = this.formatContent(fullContent) + '<span class="streaming-cursor">|</span>';
        if (!this.userScrolledUp) {
          this.scrollToBottom();
        }
      },
      // onDone
      (newConversationId) => {
        this.isStreaming = false;
        this.userScrolledUp = false;
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

        // 完成后滚动到底部
        this.scrollToBottom();
      },
      // onError
      (error) => {
        this.isStreaming = false;
        this.userScrolledUp = false;
        this.hideLoading();
        contentEl.innerHTML = `<span style="color: #ef4444;">抱歉，出了点问题：${error.message}</span>`;
        showError(error.message);
      }
    );
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
   * 清除当前对话中的所有消息
   */
  clearCurrentMessages() {
    if (this.messages.length === 0) {
      showError('当前没有对话内容');
      return;
    }

    if (!confirm('确定要清除当前对话吗？这将删除所有消息。')) {
      return;
    }

    this.messages = [];
    Storage.saveMessages([]);

    // 清空聊天区域
    const container = document.getElementById('chatContainer');
    container.innerHTML = '';

    // 显示欢迎区域
    this.showWelcome();

    this.showSaveToast('对话已清除');
  },

  /**
   * 添加消息到界面
   */
  appendMessage(role, content, isStreaming = false) {
    const container = document.getElementById('chatContainer');
    const messageIndex = this.messages.length - (role === 'user' ? 1 : 0); // 当前消息索引

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role === 'user' ? 'user-message' : 'ai-message'}`;
    messageDiv.dataset.index = messageIndex;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = isStreaming ? '' : this.formatContent(content);

    messageDiv.appendChild(contentDiv);

    // 非流式的 AI 消息添加收藏按钮
    if (role === 'assistant' && !isStreaming && content) {
      this.addMessageActions(messageDiv, content);
    }

    // 添加右键菜单
    messageDiv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showMessageContextMenu(e, messageDiv);
    });

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
  },

  /**
   * 打开惊喜盲盒
   */
  async openMysteryBox() {
    if (!Auth.isLoggedIn()) {
      Auth.showLoginModal();
      return;
    }

    // 检查是否有对话
    const input = document.getElementById('userInput');
    const inputContent = input.value.trim();

    // 如果输入框有内容，先把内容作为用户消息添加
    if (inputContent) {
      input.value = '';
      input.style.height = 'auto';
      this.hideWelcome();
      this.messages.push({ role: 'user', content: inputContent });
      this.appendMessage('user', inputContent);
      Storage.saveMessages(this.messages);
    }

    if (this.messages.length === 0) {
      showError('先聊聊天吧，让我了解你的情况');
      input.focus();
      return;
    }

    if (this.isStreaming) return;

    // 重置滚动状态
    this.userScrolledUp = false;

    // 显示加载
    this.showMysteryBoxLoading();
    this.isStreaming = true;

    // 创建盲盒卡片容器
    const boxCard = this.createMysteryBoxCard();
    const contentEl = boxCard.querySelector('.mystery-box-content .message-content');
    let fullContent = '';
    let promptInfo = null;

    try {
      const token = Auth.getToken();
      const response = await fetch(`${API.baseURL}/api/mystery-box`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          messages: this.messages.map(m => ({ role: m.role, content: m.content })),
          conversation_id: this.conversationId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '请求失败');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              // 完成
              this.finalizeMysteryBox(boxCard, promptInfo, fullContent);
            } else {
              try {
                const json = JSON.parse(data);

                // 处理 prompt 信息
                if (json.type === 'prompt_info') {
                  promptInfo = json.prompt;
                  this.updateMysteryBoxHeader(boxCard, promptInfo);
                }

                // 处理内容
                if (json.content) {
                  fullContent += json.content;
                  contentEl.innerHTML = this.formatContent(fullContent) + '<span class="streaming-cursor">|</span>';
                  if (!this.userScrolledUp) {
                    this.scrollToBottom();
                  }
                }

                // 处理错误
                if (json.error) {
                  throw new Error(json.error);
                }
              } catch (e) {
                if (e.message !== 'Unexpected end of JSON input') {
                  console.error('Parse error:', e);
                }
              }
            }
          }
        }
      }

      this.isStreaming = false;
      this.userScrolledUp = false;
      this.hideMysteryBoxLoading();
      Auth.refreshUserInfo();
      this.scrollToBottom();

    } catch (error) {
      this.isStreaming = false;
      this.userScrolledUp = false;
      this.hideMysteryBoxLoading();
      contentEl.innerHTML = `<span style="color: #ef4444;">抱歉，出了点问题：${error.message}</span>`;
      showError(error.message);
    }
  },

  /**
   * 创建盲盒卡片
   */
  createMysteryBoxCard() {
    const container = document.getElementById('chatContainer');

    const card = document.createElement('div');
    card.className = 'mystery-box-card mystery-box-opening';
    card.innerHTML = `
      <div class="mystery-box-header">
        <div class="mystery-box-title">
          <span class="mystery-box-emoji">🎁</span>
          <span class="mystery-box-category">正在开盒...</span>
        </div>
        <button class="mystery-box-toggle" style="display: none;">
          <span>－</span> 收起
        </button>
      </div>
      <div class="mystery-box-summary"></div>
      <div class="mystery-box-question" style="display: none;">
        <p></p>
      </div>
      <div class="mystery-box-content">
        <div class="message-content"></div>
      </div>
      <div class="mystery-box-actions" style="display: none;">
        <button class="mystery-box-action-btn primary" data-action="reopen">
          🔄 再开一个
        </button>
        <button class="mystery-box-action-btn" data-action="save">
          ✨ 收藏
        </button>
      </div>
    `;

    container.appendChild(card);
    this.scrollToBottom();
    return card;
  },

  /**
   * 更新盲盒卡片头部
   */
  updateMysteryBoxHeader(card, promptInfo) {
    card.classList.remove('mystery-box-opening');

    const emoji = card.querySelector('.mystery-box-emoji');
    const category = card.querySelector('.mystery-box-category');
    const question = card.querySelector('.mystery-box-question');

    emoji.textContent = promptInfo.categoryEmoji;
    category.textContent = promptInfo.categoryName;
    category.style.color = promptInfo.color;

    question.style.display = 'block';
    question.querySelector('p').textContent = promptInfo.displayQuestion;

    // 设置卡片边框颜色
    card.style.borderColor = promptInfo.color;
  },

  /**
   * 完成盲盒卡片
   */
  finalizeMysteryBox(card, promptInfo, content) {
    const contentEl = card.querySelector('.mystery-box-content .message-content');
    contentEl.innerHTML = this.formatContent(content);

    // 显示操作按钮
    const actions = card.querySelector('.mystery-box-actions');
    actions.style.display = 'flex';

    // 显示收起按钮
    const toggle = card.querySelector('.mystery-box-toggle');
    toggle.style.display = 'flex';

    // 设置摘要（取前50字）
    const summary = card.querySelector('.mystery-box-summary');
    let summaryText = content.replace(/[#*\n]/g, ' ').substring(0, 60);
    if (content.length > 60) summaryText += '...';
    summary.textContent = `「${summaryText}」`;

    // 绑定事件
    toggle.onclick = () => {
      card.classList.toggle('collapsed');
      toggle.innerHTML = card.classList.contains('collapsed')
        ? '<span>＋</span> 展开'
        : '<span>－</span> 收起';
    };

    // 再开一个
    const reopenBtn = actions.querySelector('[data-action="reopen"]');
    reopenBtn.onclick = () => {
      this.openMysteryBox();
    };

    // 收藏
    const saveBtn = actions.querySelector('[data-action="save"]');
    saveBtn.onclick = () => {
      // 收藏核心内容（取前200字）
      let textToSave = `【${promptInfo.categoryName}】${promptInfo.displayQuestion}\n\n`;
      textToSave += content.substring(0, 200);
      if (content.length > 200) textToSave += '...';
      this.saveQuote(textToSave);
    };
  },

  /**
   * 显示盲盒加载
   */
  showMysteryBoxLoading() {
    const loadingTexts = [
      "正在为你抽取视角...",
      "盲盒正在打开...",
      "看看今天遇见什么...",
      "惊喜即将揭晓..."
    ];
    const text = loadingTexts[Math.floor(Math.random() * loadingTexts.length)];
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingIndicator').style.display = 'block';
  },

  /**
   * 隐藏盲盒加载
   */
  hideMysteryBoxLoading() {
    document.getElementById('loadingIndicator').style.display = 'none';
  },

  /**
   * 显示消息右键菜单
   */
  showMessageContextMenu(e, messageEl) {
    // 移除已有的菜单
    const existingMenu = document.getElementById('messageContextMenu');
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement('div');
    menu.id = 'messageContextMenu';
    menu.className = 'context-menu';
    menu.innerHTML = `
      <button class="context-menu-item delete-item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
        删除这条消息
      </button>
    `;

    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    document.body.appendChild(menu);

    // 防止超出屏幕
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 10}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 10}px`;
    }

    // 删除按钮点击
    menu.querySelector('.delete-item').addEventListener('click', () => {
      this.deleteMessage(messageEl);
      menu.remove();
    });

    // 点击其他地方关闭菜单
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  },

  /**
   * 删除单条消息
   */
  deleteMessage(messageEl) {
    // 获取消息在数组中的索引
    const allMessages = document.querySelectorAll('#chatContainer .message');
    let index = -1;
    allMessages.forEach((el, i) => {
      if (el === messageEl) index = i;
    });

    if (index === -1 || index >= this.messages.length) {
      showError('无法删除该消息');
      return;
    }

    // 从数组中删除
    this.messages.splice(index, 1);
    Storage.saveMessages(this.messages);

    // 从界面删除（带动画）
    messageEl.style.transition = 'all 0.3s ease';
    messageEl.style.opacity = '0';
    messageEl.style.transform = 'translateX(-20px)';
    setTimeout(() => {
      messageEl.remove();
      // 如果没有消息了，显示欢迎页
      if (this.messages.length === 0) {
        this.showWelcome();
      }
    }, 300);

    this.showSaveToast('已删除');
  }
};

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', () => {
  // 等待 Auth 初始化完成
  setTimeout(() => {
    Chat.init();
  }, 100);
});

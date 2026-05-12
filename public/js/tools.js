/**
 * 工具箱模块
 * 选择 Prompt → 粘贴内容 → AI 处理 → 展示结果
 */

const Tools = {
  selectedTool: null,
  isProcessing: false,
  outputContent: '',

  // 工具列表（后续可扩展）
  toolList: [
    {
      id: '温和表达',
      name: '温和表达',
      emoji: '🕊️',
      desc: '把生硬直接的工作表达润色为温和得体的版本',
      placeholder: '粘贴你想润色的消息，比如：\n"这个方案不行，重新做"\n"你怎么还没做完"'
    }
  ],

  init() {
    this.renderToolCards();
    this.bindEvents();
    // 默认选中第一个
    if (this.toolList.length > 0) {
      this.selectTool(this.toolList[0]);
    }
  },

  renderToolCards() {
    const container = document.getElementById('toolsCards');
    container.innerHTML = this.toolList.map(tool => `
      <button class="tool-card" data-tool-id="${tool.id}">
        <span class="tool-card-emoji">${tool.emoji}</span>
        <span class="tool-card-name">${tool.name}</span>
      </button>
    `).join('');
  },

  bindEvents() {
    // 工具卡片点击
    document.getElementById('toolsCards').addEventListener('click', (e) => {
      const card = e.target.closest('.tool-card');
      if (card) {
        const toolId = card.dataset.toolId;
        const tool = this.toolList.find(t => t.id === toolId);
        if (tool) this.selectTool(tool);
      }
    });

    // 发送按钮
    document.getElementById('toolSendBtn').addEventListener('click', () => {
      this.process();
    });

    // Ctrl+Enter 快捷键
    document.getElementById('toolInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.process();
      }
    });

    // 复制按钮
    document.getElementById('toolCopyBtn').addEventListener('click', () => {
      this.copyResult();
    });
  },

  selectTool(tool) {
    this.selectedTool = tool;

    // 更新卡片样式
    document.querySelectorAll('.tool-card').forEach(card => {
      card.classList.toggle('active', card.dataset.toolId === tool.id);
    });

    // 更新描述
    const descEl = document.getElementById('toolDescription');
    descEl.style.display = 'block';
    document.getElementById('toolDescText').textContent = tool.desc;

    // 更新输入框 placeholder
    document.getElementById('toolInput').placeholder = tool.placeholder;
  },

  async process() {
    if (!Auth.isLoggedIn()) {
      Auth.showLoginModal();
      return;
    }

    if (!this.selectedTool) {
      showError('请先选择一个工具');
      return;
    }

    const input = document.getElementById('toolInput');
    const content = input.value.trim();
    if (!content) {
      showError('请输入要处理的内容');
      input.focus();
      return;
    }

    if (this.isProcessing) return;
    this.isProcessing = true;

    // 显示加载，隐藏旧输出
    document.getElementById('toolLoading').style.display = 'flex';
    document.getElementById('toolOutputSection').style.display = 'none';
    this.outputContent = '';

    // 准备输出区
    const outputSection = document.getElementById('toolOutputSection');
    const outputContent = document.getElementById('toolOutputContent');

    await API.chatStream(
      [{ role: 'user', content: content }],
      this.selectedTool.id,
      null,
      // onChunk
      (chunk) => {
        // 首个 chunk 到达时再显示输出区（避免空白闪烁）
        if (!this.outputContent) {
          document.getElementById('toolLoading').style.display = 'none';
          outputSection.style.display = 'block';
          outputContent.innerHTML = '';
        }
        this.outputContent += chunk;
        outputContent.innerHTML = this.formatContent(this.outputContent) + '<span class="streaming-cursor">|</span>';
        // 输出区内部滚动到底，不影响外部页面
        outputContent.scrollTop = outputContent.scrollHeight;
      },
      // onDone
      () => {
        this.isProcessing = false;
        document.getElementById('toolLoading').style.display = 'none';
        outputSection.style.display = 'block';
        outputContent.innerHTML = this.formatContent(this.outputContent);
        Auth.refreshUserInfo();
      },
      // onError
      (error) => {
        this.isProcessing = false;
        document.getElementById('toolLoading').style.display = 'none';
        outputContent.innerHTML = `<span style="color: #ef4444;">处理失败：${error.message}</span>`;
        showError(error.message);
      }
    );
  },

  copyResult() {
    if (!this.outputContent) {
      showError('没有可复制的内容');
      return;
    }
    navigator.clipboard.writeText(this.outputContent).then(() => {
      const toast = document.getElementById('saveToast');
      document.getElementById('saveToastText').textContent = '已复制 ✓';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    });
  },

  formatContent(text) {
    if (!text) return '';
    return text
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    Tools.init();
  }, 100);
});

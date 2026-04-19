/**
 * 本地存储模块（临时缓存，主要数据存后端）
 */

const Storage = {
  /**
   * 获取当前对话 ID
   */
  getConversationId() {
    return localStorage.getItem(CONFIG.CONVERSATION_KEY);
  },

  /**
   * 设置当前对话 ID
   */
  setConversationId(id) {
    if (id) {
      localStorage.setItem(CONFIG.CONVERSATION_KEY, id);
    } else {
      localStorage.removeItem(CONFIG.CONVERSATION_KEY);
    }
  },

  /**
   * 获取当前会话的消息（临时缓存）
   */
  getMessages() {
    try {
      const data = localStorage.getItem(CONFIG.MESSAGES_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  /**
   * 保存消息到临时缓存
   */
  saveMessages(messages) {
    localStorage.setItem(CONFIG.MESSAGES_KEY, JSON.stringify(messages));
  },

  /**
   * 清空当前会话
   */
  clearCurrentSession() {
    localStorage.removeItem(CONFIG.CONVERSATION_KEY);
    localStorage.removeItem(CONFIG.MESSAGES_KEY);
  }
};

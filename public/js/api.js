/**
 * API 请求模块
 */

const API = {
  /**
   * 获取存储的 Token
   */
  getToken() {
    return localStorage.getItem(CONFIG.TOKEN_KEY);
  },

  /**
   * 设置 Token
   */
  setToken(token) {
    localStorage.setItem(CONFIG.TOKEN_KEY, token);
  },

  /**
   * 清除 Token
   */
  clearToken() {
    localStorage.removeItem(CONFIG.TOKEN_KEY);
    localStorage.removeItem(CONFIG.USER_KEY);
  },

  /**
   * 获取请求头
   */
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  },

  /**
   * 通用请求方法
   */
  async request(endpoint, options = {}) {
    const url = `${CONFIG.API_BASE}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers
      }
    });

    // 处理 401 未授权
    if (response.status === 401) {
      this.clearToken();
      // 触发登录弹窗
      if (typeof Auth !== 'undefined' && Auth.showLoginModal) {
        Auth.showLoginModal();
      }
      throw new Error('请先登录');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '请求失败');
    }

    return data;
  },

  /**
   * GET 请求
   */
  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  /**
   * POST 请求
   */
  async post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  /**
   * PUT 请求
   */
  async put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  /**
   * DELETE 请求
   */
  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  /**
   * 流式聊天请求
   */
  async chatStream(messages, functionUsed, conversationId, onChunk, onDone, onError) {
    const url = `${CONFIG.API_BASE}/api/chat`;
    let newConversationId = null;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          messages,
          function_used: functionUsed,
          conversation_id: conversationId
        })
      });

      if (response.status === 401) {
        this.clearToken();
        if (typeof Auth !== 'undefined' && Auth.showLoginModal) {
          Auth.showLoginModal();
        }
        onError(new Error('请先登录'));
        return;
      }

      if (response.status === 429) {
        const data = await response.json();
        onError(new Error(data.error || '今日免费额度已用完'));
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        onError(new Error(data.error || 'AI 服务暂时不可用'));
        return;
      }

      // 处理 SSE 流
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
              onDone(newConversationId);
              return;
            }
            try {
              const json = JSON.parse(data);
              if (json.content) {
                onChunk(json.content);
              }
              if (json.conversation_id) {
                newConversationId = json.conversation_id;
              }
              if (json.error) {
                onError(new Error(json.error));
                return;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      onDone(newConversationId);

    } catch (error) {
      onError(error);
    }
  }
};

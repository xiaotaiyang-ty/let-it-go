/**
 * 认证模块
 */

const Auth = {
  // 当前用户信息
  currentUser: null,

  /**
   * 初始化
   */
  init() {
    // 检查是否已登录
    const token = API.getToken();
    const savedUser = localStorage.getItem(CONFIG.USER_KEY);

    if (token && savedUser) {
      try {
        this.currentUser = JSON.parse(savedUser);
        this.updateUI();
        this.refreshUserInfo(); // 后台刷新最新信息
      } catch (e) {
        this.logout();
      }
    } else {
      // 未登录，显示登录弹窗
      this.showLoginModal();
    }

    // 绑定事件
    this.bindEvents();
  },

  /**
   * 绑定事件
   */
  bindEvents() {
    // 登录/注册标签切换
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const isLogin = tab.dataset.tab === 'login';
        document.getElementById('authModalTitle').textContent = isLogin ? '👋 欢迎回来' : '✨ 创建账号';
        document.getElementById('authModalDesc').textContent = isLogin
          ? '登录后可以保存对话历史和收藏'
          : '只需昵称和密码，简单开始';
        document.getElementById('authSubmitBtn').textContent = isLogin ? '登录' : '注册';
        document.getElementById('authError').style.display = 'none';
      });
    });

    // 提交按钮
    document.getElementById('authSubmitBtn').addEventListener('click', () => {
      const isLogin = document.querySelector('.auth-tab.active').dataset.tab === 'login';
      if (isLogin) {
        this.login();
      } else {
        this.register();
      }
    });

    // 回车提交
    document.getElementById('authPassword').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('authSubmitBtn').click();
      }
    });

    // 退出登录
    document.getElementById('logoutBtn').addEventListener('click', () => {
      if (confirm('确定要退出登录吗？')) {
        this.logout();
      }
    });

    // 头像选择
    this.bindAvatarEvents();
  },

  /**
   * 绑定头像选择事件
   */
  bindAvatarEvents() {
    const avatarEl = document.getElementById('userAvatar');
    const avatarModal = document.getElementById('avatarModal');
    const avatarGrid = document.getElementById('avatarGrid');
    const avatarCloseBtn = document.getElementById('avatarCloseBtn');

    if (!avatarEl || !avatarModal) return;

    // 点击头像打开选择弹窗
    avatarEl.addEventListener('click', () => {
      avatarModal.style.display = 'flex';
      // 标记当前选中
      const currentAvatar = localStorage.getItem('userAvatar') || '🌱';
      avatarGrid.querySelectorAll('.avatar-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.avatar === currentAvatar);
      });
    });

    // 选择头像
    avatarGrid.addEventListener('click', (e) => {
      const option = e.target.closest('.avatar-option');
      if (option) {
        const avatar = option.dataset.avatar;
        localStorage.setItem('userAvatar', avatar);
        avatarEl.textContent = avatar;
        avatarModal.style.display = 'none';
      }
    });

    // 关闭弹窗
    avatarCloseBtn.addEventListener('click', () => {
      avatarModal.style.display = 'none';
    });

    avatarModal.querySelector('.modal-overlay').addEventListener('click', () => {
      avatarModal.style.display = 'none';
    });

    // 加载保存的头像
    const savedAvatar = localStorage.getItem('userAvatar');
    if (savedAvatar) {
      avatarEl.textContent = savedAvatar;
    }
  },

  /**
   * 显示登录弹窗
   */
  showLoginModal() {
    document.getElementById('authModal').style.display = 'flex';
    document.getElementById('authNickname').focus();
  },

  /**
   * 隐藏登录弹窗
   */
  hideLoginModal() {
    document.getElementById('authModal').style.display = 'none';
    document.getElementById('authNickname').value = '';
    document.getElementById('authPassword').value = '';
    document.getElementById('authError').style.display = 'none';
  },

  /**
   * 显示错误
   */
  showError(message) {
    const errorEl = document.getElementById('authError');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  },

  /**
   * 注册
   */
  async register() {
    const nickname = document.getElementById('authNickname').value.trim();
    const password = document.getElementById('authPassword').value;

    if (!nickname) {
      this.showError('请输入昵称');
      return;
    }
    if (nickname.length < 2 || nickname.length > 20) {
      this.showError('昵称长度需要在 2-20 字符之间');
      return;
    }
    if (!password || password.length < 6) {
      this.showError('密码至少需要 6 位');
      return;
    }

    try {
      const btn = document.getElementById('authSubmitBtn');
      btn.disabled = true;
      btn.textContent = '注册中...';

      const data = await API.post('/api/auth/register', { nickname, password });

      API.setToken(data.token);
      localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(data.user));
      this.currentUser = data.user;

      this.hideLoginModal();
      this.updateUI();
      showToast('注册成功，欢迎你！');

    } catch (error) {
      this.showError(error.message);
    } finally {
      const btn = document.getElementById('authSubmitBtn');
      btn.disabled = false;
      btn.textContent = '注册';
    }
  },

  /**
   * 登录
   */
  async login() {
    const nickname = document.getElementById('authNickname').value.trim();
    const password = document.getElementById('authPassword').value;

    if (!nickname) {
      this.showError('请输入昵称');
      return;
    }
    if (!password) {
      this.showError('请输入密码');
      return;
    }

    try {
      const btn = document.getElementById('authSubmitBtn');
      btn.disabled = true;
      btn.textContent = '登录中...';

      const data = await API.post('/api/auth/login', { nickname, password });

      API.setToken(data.token);
      localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(data.user));
      this.currentUser = data.user;

      this.hideLoginModal();
      this.updateUI();
      showToast('登录成功！');

    } catch (error) {
      this.showError(error.message);
    } finally {
      const btn = document.getElementById('authSubmitBtn');
      btn.disabled = false;
      btn.textContent = '登录';
    }
  },

  /**
   * 退出登录
   */
  logout() {
    API.clearToken();
    this.currentUser = null;
    this.updateUI();
    this.showLoginModal();
  },

  /**
   * 刷新用户信息
   */
  async refreshUserInfo() {
    try {
      const data = await API.get('/api/auth/me');
      this.currentUser = data.user;
      localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(data.user));
      this.updateUI();
    } catch (error) {
      // 静默失败
      console.error('刷新用户信息失败:', error);
    }
  },

  /**
   * 更新 UI
   */
  updateUI() {
    const userNameEl = document.getElementById('userName');
    const userQuotaEl = document.getElementById('userQuota');
    const logoutBtn = document.getElementById('logoutBtn');

    if (this.currentUser) {
      userNameEl.textContent = this.currentUser.nickname;
      const remaining = this.currentUser.free_daily_limit - this.currentUser.free_usage_today;
      userQuotaEl.textContent = `今日剩余 ${remaining}/${this.currentUser.free_daily_limit} 次`;
      logoutBtn.style.display = 'flex';
    } else {
      userNameEl.textContent = '未登录';
      userQuotaEl.textContent = '--';
      logoutBtn.style.display = 'none';
    }
  },

  /**
   * 检查是否已登录
   */
  isLoggedIn() {
    return !!API.getToken() && !!this.currentUser;
  }
};

/**
 * 显示 Toast 提示
 */
function showToast(message, type = 'save') {
  const toast = document.getElementById(type + 'Toast') || document.getElementById('saveToast');
  if (toast) {
    const textEl = toast.querySelector('span:last-child') || toast.querySelector('span');
    if (textEl) textEl.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }
}

/**
 * 显示错误提示
 */
function showError(message) {
  const toast = document.getElementById('errorToast');
  if (toast) {
    document.getElementById('errorText').textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }
}

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
});

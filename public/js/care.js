/**
 * 生活关怀模块
 */

const Care = {
  messages: {
    morning: [
      "早上好呀，记得吃早餐哦 ☀️",
      "新的一天，要对自己好一点",
      "早起的你真棒，别忘了喝杯水"
    ],
    noon: [
      "中午了，该吃饭啦 🍚",
      "休息一下吧，下午还要继续加油",
      "别忘了午餐，照顾好自己的胃"
    ],
    afternoon: [
      "下午了，喝杯水吧 💧",
      "累了就休息一下，不必一直撑着",
      "下午茶时间，要不要放松一下？"
    ],
    evening: [
      "晚上好，今天辛苦了 🌙",
      "记得吃晚饭，别亏待自己",
      "夜深了，早点休息吧"
    ],
    night: [
      "该睡觉啦，明天又是新的一天 😴",
      "夜深了，好好休息吧",
      "晚安，做个好梦"
    ]
  },

  /**
   * 获取当前时段
   */
  getPeriod() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 10) return 'morning';
    if (hour >= 10 && hour < 14) return 'noon';
    if (hour >= 14 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 22) return 'evening';
    return 'night';
  },

  /**
   * 获取随机关怀消息
   */
  getMessage() {
    const period = this.getPeriod();
    const msgs = this.messages[period];
    return msgs[Math.floor(Math.random() * msgs.length)];
  },

  /**
   * 显示关怀提示
   */
  show() {
    const careReminder = document.getElementById('careReminder');
    const careText = document.getElementById('careText');

    if (careReminder && careText) {
      careText.textContent = this.getMessage();
      careReminder.classList.add('show');
      careReminder.style.display = 'flex';

      // 10秒后自动隐藏
      setTimeout(() => this.hide(), 10000);
    }
  },

  /**
   * 隐藏关怀提示
   */
  hide() {
    const careReminder = document.getElementById('careReminder');
    if (careReminder) {
      careReminder.classList.remove('show');
      setTimeout(() => {
        careReminder.style.display = 'none';
      }, 300);
    }
  },

  /**
   * 初始化
   */
  init() {
    // 绑定关闭按钮
    const closeBtn = document.getElementById('careClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hide());
    }

    // 30分钟后显示关怀提示（如果用户还在页面）
    setTimeout(() => {
      if (document.visibilityState === 'visible') {
        this.show();
      }
    }, 30 * 60 * 1000);
  }
};

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', () => {
  Care.init();
});

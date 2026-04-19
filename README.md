# 不内耗小软件 - 部署指南

> 一步步教你把项目部署到线上，完全免费！

---

## 📋 准备工作

你需要：
1. **GitHub 账号** - 用于托管代码
2. **Vercel 账号** - 用于部署（可用 GitHub 直接登录）
3. **MongoDB Atlas 账号** - 免费云数据库

---

## 🚀 部署步骤

### 第一步：创建 MongoDB Atlas 数据库（约 5 分钟）

1. 访问 [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) 注册账号

2. 创建免费集群：
   - 点击 "Build a Cluster"
   - 选择 **FREE** 免费方案
   - 选择云服务商（推荐 AWS）和区域（推荐 Singapore 或 Hong Kong）
   - 点击 "Create Cluster"

3. 设置数据库访问：
   - 左侧菜单点击 "Database Access"
   - 点击 "Add New Database User"
   - 输入用户名和密码（**记住这个密码！**）
   - 权限选择 "Read and write to any database"
   - 点击 "Add User"

4. 设置网络访问：
   - 左侧菜单点击 "Network Access"
   - 点击 "Add IP Address"
   - 点击 "Allow Access from Anywhere"（添加 0.0.0.0/0）
   - 点击 "Confirm"

5. 获取连接字符串：
   - 回到 "Database" 页面
   - 点击 "Connect"
   - 选择 "Connect your application"
   - 复制连接字符串，格式如：
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   - 把 `<username>` 和 `<password>` 替换成你刚才创建的用户名和密码
   - 在 `mongodb.net/` 后面加上数据库名 `buneihao`，变成：
   ```
   mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/buneihao?retryWrites=true&w=majority
   ```

---

### 第二步：上传代码到 GitHub（约 3 分钟）

1. 登录 [GitHub](https://github.com)

2. 点击右上角 "+" → "New repository"

3. 填写：
   - Repository name: `buneihao`（或你喜欢的名字）
   - 选择 **Private**（私有，保护你的代码）
   - 点击 "Create repository"

4. 上传代码：
   - 在你的电脑上，打开终端，进入 `deploy` 文件夹
   - 执行以下命令：

   ```bash
   cd /Users/anne/Documents/2026/DUCC项目/不内耗小软件/deploy

   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/你的用户名/buneihao.git
   git push -u origin main
   ```

---

### 第三步：部署到 Vercel（约 5 分钟）

1. 访问 [Vercel](https://vercel.com) 并用 GitHub 账号登录

2. 点击 "Add New..." → "Project"

3. 选择你刚才创建的 `buneihao` 仓库，点击 "Import"

4. 配置项目：
   - Framework Preset: 选择 "Other"
   - Root Directory: 保持默认

5. **重要：配置环境变量**
   - 展开 "Environment Variables"
   - 添加以下变量：

   | Name | Value |
   |------|-------|
   | `MONGODB_URI` | 你的 MongoDB 连接字符串（第一步获取的） |
   | `JWT_SECRET` | 随机字符串，如 `your-super-secret-key-change-this-123` |
   | `AI_API_KEY` | `f6ba6131-d9b6-44f1-ac08-7317abe96094`（默认免费 Key） |
   | `AI_API_ENDPOINT` | `https://ark.cn-beijing.volces.com/api/v3/chat/completions` |
   | `AI_MODEL` | `deepseek-v3-2-251201` |
   | `FREE_DAILY_LIMIT` | `10`（每用户每天免费次数） |

6. 点击 "Deploy"

7. 等待部署完成（约 1-2 分钟）

8. 部署成功！你会得到一个网址，如：`https://buneihao.vercel.app`

---

## ✅ 验证部署

1. 访问你的网址
2. 应该看到登录/注册页面
3. 注册一个账号
4. 尝试发送一条消息
5. 如果 AI 回复了，说明部署成功！🎉

---

## 🔧 常见问题

### Q: 部署失败，显示 "Function Error"？
A: 检查 `MONGODB_URI` 是否正确，特别是：
- 用户名和密码是否正确
- 是否添加了数据库名 `buneihao`
- 是否允许了所有 IP 访问

### Q: 登录后显示 "服务器错误"？
A: 检查 Vercel 的 Function Logs：
1. 进入 Vercel 项目
2. 点击 "Deployments" → 最新的部署
3. 点击 "Functions" 标签
4. 查看错误日志

### Q: AI 不回复？
A: 检查 `AI_API_KEY` 是否正确配置

### Q: 想换成自己的域名？
A: 在 Vercel 项目设置中：
1. 点击 "Settings" → "Domains"
2. 添加你的域名
3. 按提示配置 DNS

---

## 📊 后台管理

### 查看用户数据
登录 MongoDB Atlas，点击 "Browse Collections" 可以看到：
- `users` - 用户列表
- `conversations` - 对话记录
- `saved_quotes` - 收藏金句
- `user_logs` - 用户行为日志

### 修改免费额度
在 Vercel 项目设置中修改环境变量 `FREE_DAILY_LIMIT` 的值，然后重新部署。

---

## 💰 成本说明

| 项目 | 费用 |
|------|------|
| Vercel 托管 | 免费 |
| MongoDB Atlas | 免费（512MB） |
| 域名（可选） | ¥50-100/年 |
| AI API | 按量付费，约 ¥0.01/次 |

**预估月成本：¥0-50**（取决于用户量和 AI 调用次数）

---

## 🎉 恭喜！

你的「不内耗」小软件已经上线了！

把链接分享给朋友试试吧 ✨

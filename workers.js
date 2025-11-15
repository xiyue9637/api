export default {
  async fetch(request, env) {
    // CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    try {
      // 邀请码
      const INVITE_CODE = "xiyue520";

      // 初始化 KV 命名空间
      const { USERS_KV, MESSAGES_KV, CONFIG_KV } = env;
      
      // 检查 KV 命名空间是否配置正确
      if (!USERS_KV || !MESSAGES_KV || !CONFIG_KV) {
        throw new Error("Missing KV namespace configuration");
      }

      // 简单的加密/解密函数
      const encryptMessage = (message) => {
        return btoa(unescape(encodeURIComponent(message)));
      };

      const decryptMessage = (encryptedMessage) => {
        try {
          return decodeURIComponent(escape(atob(encryptedMessage)));
        } catch (e) {
          console.error("解密失败:", e);
          return encryptedMessage; // 如果解密失败，返回原文
        }
      };

      // 初始化管理员
      const initAdminUser = async () => {
        const adminKey = `user:xiyue`;
        const existingAdmin = await USERS_KV.get(adminKey, { type: 'json' });
        
        if (!existingAdmin) {
          const admin = {
            username: "xiyue",
            password: "20090327qi", // 实际生产中应哈希存储
            nickname: "管理员",
            avatar: "https://i.pravatar.cc/150?u=admin",
            isAdmin: true,
            createdAt: new Date().toISOString(),
            isMuted: false
          };
          
          await USERS_KV.put(adminKey, JSON.stringify(admin));
          console.log("管理员用户 'xiyue' 已创建");
        }
      };

      // 初始化配置
      const initConfig = async () => {
        // 初始化自动清除时间
        const clearTimeKey = `config:clearTime`;
        const existingClearTime = await CONFIG_KV.get(clearTimeKey);
        if (!existingClearTime) {
          await CONFIG_KV.put(clearTimeKey, "0");
          console.log("自动清除时间配置已初始化");
        }
        
        // 初始化禁言列表
        const muteListKey = `config:muteList`;
        const existingMuteList = await CONFIG_KV.get(muteListKey, { type: 'json' });
        if (!existingMuteList) {
          await CONFIG_KV.put(muteListKey, JSON.stringify([]));
          console.log("禁言列表配置已初始化");
        }
      };

      // 初始化
      await initAdminUser();
      await initConfig();

      // 验证邀请码
      const validateInviteCode = (code) => {
        return code && code.toLowerCase() === INVITE_CODE.toLowerCase();
      };

      // 验证头像 URL 和大小 (通过 HEAD 请求)
      const validateAvatar = async (avatarUrl) => {
        if (!avatarUrl) return false;
        
        try {
          new URL(avatarUrl); // 验证 URL 格式
          
          const headResponse = await fetch(avatarUrl, { method: 'HEAD' });
          const contentLength = headResponse.headers.get('content-length');
          
          if (!contentLength) {
            // 如果服务器不返回 Content-Length，无法判断大小，允许继续
            console.warn("无法确定头像大小，服务器未返回 Content-Length 头");
            return true;
          }
          
          const sizeInBytes = parseInt(contentLength);
          const sizeInMB = sizeInBytes / (1024 * 1024);
          
          if (sizeInMB > 2) {
            return false; // 大于 2MB
          }
          
          const contentType = headResponse.headers.get('content-type');
          return contentType && contentType.startsWith('image/'); // 验证是否为图片
        } catch (error) {
          console.error("验证头像失败:", error);
          return false;
        }
      };

      // 路由处理
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;

      // API 处理函数
      const apiHandlers = {
        // 根路径欢迎页面
        async '/'() {
          const html = `
            <!DOCTYPE html>
            <html lang="zh-CN">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>聊天室后端</title>
              <style>
                body {
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  background-color: #f0f8ff;
                  color: #293241;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  min-height: 100vh;
                  padding: 20px;
                  margin: 0;
                }
                .container {
                  text-align: center;
                  max-width: 600px;
                  padding: 30px;
                  background-color: white;
                  border-radius: 15px;
                  box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                }
                h1 {
                  color: #457b9d;
                  font-size: 2.5em;
                  margin-bottom: 10px;
                }
                .emoji {
                  font-size: 2em;
                  margin-right: 10px;
                }
                p {
                  margin: 15px 0;
                  line-height: 1.6;
                }
                .admin-info {
                  background-color: #f8f9fa;
                  padding: 15px;
                  border-radius: 8px;
                  margin: 20px 0;
                  text-align: left;
                }
                .admin-info strong {
                  color: #e63946;
                }
                ul {
                  text-align: left;
                  margin: 20px auto;
                  padding-left: 20px;
                }
                li {
                  margin: 10px 0;
                  padding: 8px;
                  background-color: #f1faee;
                  border-radius: 6px;
                }
                .endpoint {
                  background-color: #a8dadc;
                  padding: 5px 10px;
                  border-radius: 4px;
                  font-weight: bold;
                  font-family: monospace;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h1><span class="emoji">🎨</span>聊天室后端运行正常</h1>
                <p>这是 API 服务，请配合前端使用。</p>
                <div class="admin-info">
                  <strong>管理员账号：</strong>用户名 <span class="endpoint">xiyue</span>，密码 <span class="endpoint">20090327qi</span>
                </div>
                <p>请通过前端页面与以下接口交互:</p>
                <ul>
                  <li><span class="endpoint">POST /register</span> - 用户注册 (需邀请码)</li>
                  <li><span class="endpoint">POST /login</span> - 用户登录</li>
                  <li><span class="endpoint">GET /messages</span> - 获取消息</li>
                  <li><span class="endpoint">POST /send</span> - 发送消息</li>
                  <li><span class="endpoint">GET /user-list</span> - 获取用户列表 (管理员)</li>
                  <li><span class="endpoint">POST /mute</span> - 禁言用户 (管理员)</li>
                  <li><span class="endpoint">POST /unmute</span> - 解禁用户 (管理员)</li>
                  <li><span class="endpoint">POST /remove</span> - 移除用户 (管理员)</li>
                  <li><span class="endpoint">GET /get-clear-time</span> - 获取自动清除时间 (管理员)</li>
                  <li><span class="endpoint">POST /set-clear-time</span> - 设置自动清除时间 (管理员)</li>
                  <li><span class="endpoint">POST /clear-messages</span> - 清除所有消息 (管理员)</li>
                  <li><span class="endpoint">GET /get-mute-list</span> - 获取禁言列表 (管理员)</li>
                </ul>
              </div>
            </body>
            </html>
          `;
          return new Response(html, {
            headers: { 'Content-Type': 'text/html' }
          });
        },

        // 注册
        async '/register'(request) {
          const { username, password, nickname, avatar, inviteCode } = await request.json();
          
          if (!username || !password || !nickname || !avatar || !inviteCode) {
            return new Response(JSON.stringify({ error: '缺少必要字段' }), { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          if (!validateInviteCode(inviteCode)) {
            return new Response(JSON.stringify({ error: '无效的邀请码' }), { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          if (!(await validateAvatar(avatar))) {
            return new Response(JSON.stringify({ error: '无效的头像 URL 或文件过大 (最大 2MB)' }), { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          const userKey = `user:${username}`;
          const existingUser = await USERS_KV.get(userKey, { type: 'json' });
          if (existingUser) {
            return new Response(JSON.stringify({ error: '用户名已存在' }), { 
              status: 409,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          const newUser = {
            username,
            password, // 实际应用应哈希存储
            nickname,
            avatar,
            isAdmin: false,
            createdAt: new Date().toISOString(),
            isMuted: false
          };
          
          await USERS_KV.put(userKey, JSON.stringify(newUser));
          return new Response(JSON.stringify({ success: true }), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 登录
        async '/login'(request) {
          const { username, password } = await request.json();
          
          if (!username || !password) {
            return new Response(JSON.stringify({ error: '缺少用户名或密码' }), { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          const userKey = `user:${username}`;
          const user = await USERS_KV.get(userKey, { type: 'json' });
          
          if (!user || user.password !== password) {
            return new Response(JSON.stringify({ error: '用户名或密码错误' }), { 
              status: 401,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          // 返回用户信息 (不包含密码)
          const { password: _, ...userWithoutPassword } = user;
          return new Response(JSON.stringify({ user: userWithoutPassword }), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 获取消息
        async '/messages'() {
          // 获取所有消息键
          let messageKeys = await MESSAGES_KV.list({ prefix: 'message:' });
          
          // 按时间排序（假设键包含时间戳）
          const messages = [];
          for (const key of messageKeys.keys) {
            if (key.name.startsWith('message:id:')) continue; // 跳过ID计数器
            const msg = await MESSAGES_KV.get(key.name, { type: 'json' });
            if (msg) {
              msg._id = key.name.replace('message:', '');
              messages.push(msg);
            }
          }
          
          // 按时间排序，取最近50条
          messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          const recentMessages = messages.slice(-50);
          
          // 解密消息内容
          const decryptedMessages = recentMessages.map(msg => ({
            ...msg,
            message: decryptMessage(msg.message)
          }));
          
          return new Response(JSON.stringify(decryptedMessages), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 发送消息
        async '/send'(request) {
          const { username, message } = await request.json();
          
          if (!username || !message) {
            return new Response(JSON.stringify({ error: '缺少用户名或消息内容' }), { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          const userKey = `user:${username}`;
          const user = await USERS_KV.get(userKey, { type: 'json' });
          
          if (!user) {
            return new Response(JSON.stringify({ error: '用户不存在' }), { 
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          if (user.isMuted) {
            return new Response(JSON.stringify({ error: '您已被禁言，无法发送消息' }), { 
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          // 加密消息
          const encryptedMessage = encryptMessage(message);
          
          // 生成唯一消息ID (时间戳+随机数)
          const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          const messageKey = `message:${messageId}`;
          
          // 保存消息
          const newMessage = {
            username: user.username,
            nickname: user.nickname,
            avatar: user.avatar,
            message: encryptedMessage,
            timestamp: new Date().toISOString()
          };
          
          await MESSAGES_KV.put(messageKey, JSON.stringify(newMessage));
          
          return new Response(JSON.stringify({ success: true }), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 获取用户列表
        async '/user-list'() {
          let userKeys = await USERS_KV.list({ prefix: 'user:' });
          const users = [];
          
          for (const key of userKeys.keys) {
            const user = await USERS_KV.get(key.name, { type: 'json' });
            if (user) {
              const { password, ...userWithoutPassword } = user;
              users.push(userWithoutPassword);
            }
          }
          
          return new Response(JSON.stringify(users), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 获取自动清除时间
        async '/get-clear-time'() {
          const clearTimeKey = `config:clearTime`;
          const clearTime = await CONFIG_KV.get(clearTimeKey) || "0";
          
          return new Response(JSON.stringify({ time: parseInt(clearTime) }), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 设置自动清除时间
        async '/set-clear-time'(request) {
          const { time } = await request.json();
          
          if (typeof time !== 'number' || time < 0) {
            return new Response(JSON.stringify({ error: '无效的时间值' }), { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          const clearTimeKey = `config:clearTime`;
          await CONFIG_KV.put(clearTimeKey, time.toString());
          
          return new Response(JSON.stringify({ success: true }), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 清除所有消息
        async '/clear-messages'() {
          // 获取所有消息键
          let messageKeys = await MESSAGES_KV.list({ prefix: 'message:' });
          
          // 删除所有消息
          const deletePromises = [];
          for (const key of messageKeys.keys) {
            if (key.name.startsWith('message:id:')) continue; // 跳过ID计数器
            deletePromises.push(MESSAGES_KV.delete(key.name));
          }
          
          await Promise.all(deletePromises);
          
          return new Response(JSON.stringify({ success: true }), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 禁言用户
        async '/mute'(request) {
          const { username } = await request.json();
          
          if (!username) {
            return new Response(JSON.stringify({ error: '缺少用户名' }), { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          const userKey = `user:${username}`;
          const user = await USERS_KV.get(userKey, { type: 'json' });
          
          if (!user) {
            return new Response(JSON.stringify({ error: '用户不存在' }), { 
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          // 不能禁言管理员
          if (user.username === "xiyue") {
            return new Response(JSON.stringify({ error: '不能禁言管理员' }), { 
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          await USERS_KV.put(userKey, JSON.stringify({ 
            ...user, 
            isMuted: true 
          }));
          
          // 更新禁言列表
          const muteListKey = `config:muteList`;
          let muteList = await CONFIG_KV.get(muteListKey, { type: 'json' }) || [];
          if (!muteList.includes(username)) {
            muteList.push(username);
            await CONFIG_KV.put(muteListKey, JSON.stringify(muteList));
          }
          
          return new Response(JSON.stringify({ success: true }), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 解禁用户
        async '/unmute'(request) {
          const { username } = await request.json();
          
          if (!username) {
            return new Response(JSON.stringify({ error: '缺少用户名' }), { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          const userKey = `user:${username}`;
          const user = await USERS_KV.get(userKey, { type: 'json' });
          
          if (!user) {
            return new Response(JSON.stringify({ error: '用户不存在' }), { 
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          await USERS_KV.put(userKey, JSON.stringify({ 
            ...user, 
            isMuted: false 
          }));
          
          // 更新禁言列表
          const muteListKey = `config:muteList`;
          let muteList = await CONFIG_KV.get(muteListKey, { type: 'json' }) || [];
          muteList = muteList.filter(u => u !== username);
          await CONFIG_KV.put(muteListKey, JSON.stringify(muteList));
          
          return new Response(JSON.stringify({ success: true }), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 获取禁言列表
        async '/get-mute-list'() {
          const muteListKey = `config:muteList`;
          const muteList = await CONFIG_KV.get(muteListKey, { type: 'json' }) || [];
          
          return new Response(JSON.stringify({ 
            users: muteList 
          }), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 移除用户
        async '/remove'(request) {
          const { username } = await request.json();
          
          if (!username) {
            return new Response(JSON.stringify({ error: '缺少用户名' }), { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          const userKey = `user:${username}`;
          const user = await USERS_KV.get(userKey, { type: 'json' });
          
          if (!user) {
            return new Response(JSON.stringify({ error: '用户不存在' }), { 
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          // 不能移除管理员
          if (user.username === "xiyue") {
            return new Response(JSON.stringify({ error: '不能移除管理员' }), { 
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          await USERS_KV.delete(userKey);
          
          return new Response(JSON.stringify({ success: true }), { 
            headers: { 'Content-Type': 'application/json' }
          });
        }
      };

      // 处理请求
      let response;
      if (path in apiHandlers) {
        response = await apiHandlers[path](request, env);
      } else {
        // 404
        response = new Response(JSON.stringify({ error: '路由未找到' }), { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 添加 CORS 头
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      return new Response(response.body, {
        status: response.status,
        headers: headers
      });
    } catch (error) {
      console.error("Worker 错误:", error);
      return new Response(JSON.stringify({ error: '服务器内部错误: ' + error.message }), { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    }
  },

  async scheduled(event, env, ctx) {
    try {
      const { MESSAGES_KV, CONFIG_KV } = env;
      
      if (!MESSAGES_KV || !CONFIG_KV) {
        console.error("定时任务: 缺少 KV 命名空间配置");
        return;
      }

      // 获取自动清除时间
      const clearTimeKey = `config:clearTime`;
      const clearTime = parseInt(await CONFIG_KV.get(clearTimeKey) || "0");
      
      if (clearTime > 0) {
        const cutoffDate = new Date(Date.now() - clearTime);
        
        // 获取所有消息
        let messageKeys = await MESSAGES_KV.list({ prefix: 'message:' });
        
        // 删除过期消息
        let deletedCount = 0;
        for (const key of messageKeys.keys) {
          if (key.name.startsWith('message:id:')) continue; // 跳过ID计数器
          
          const msg = await MESSAGES_KV.get(key.name, { type: 'json' });
          if (msg && new Date(msg.timestamp) < cutoffDate) {
            await MESSAGES_KV.delete(key.name);
            deletedCount++;
          }
        }
        
        console.log(`定时任务: 已清除 ${cutoffDate.toISOString()} 之前的消息，共 ${deletedCount} 条`);
      } else {
          console.log("定时任务: 自动清除时间设置为 0，跳过清理。");
      }
    } catch (error) {
      console.error("定时任务错误:", error);
    }
  }
};
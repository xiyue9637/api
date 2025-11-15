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
      
      // 检查 KV 命名空间
      if (!env.USERS_KV || !env.MESSAGES_KV || !env.CONFIG_KV) {
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
          return encryptedMessage;
        }
      };

      // 初始化管理员
      const initAdminUser = async () => {
        const adminKey = "user:xiyue";
        const existingAdmin = await env.USERS_KV.get(adminKey, { type: 'json' });
        
        if (!existingAdmin) {
          const admin = {
            username: "xiyue",
            password: "20090327qi",
            nickname: "管理员",
            avatar: "https://i.pravatar.cc/150?u=admin",
            isAdmin: true,
            createdAt: new Date().toISOString(),
            isMuted: false
          };
          
          await env.USERS_KV.put(adminKey, JSON.stringify(admin));
          console.log("管理员用户 'xiyue' 已创建");
        }
      };

      // 初始化配置
      const initConfig = async () => {
        const clearTimeKey = "config:clearTime";
        const existingClearTime = await env.CONFIG_KV.get(clearTimeKey);
        if (!existingClearTime) {
          await env.CONFIG_KV.put(clearTimeKey, "0");
          console.log("自动清除时间配置已初始化");
        }
        
        const muteListKey = "config:muteList";
        const existingMuteList = await env.CONFIG_KV.get(muteListKey, { type: 'json' });
        if (!existingMuteList) {
          await env.CONFIG_KV.put(muteListKey, JSON.stringify([]));
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

      // 验证头像 URL (移除大小限制，仅验证格式和是否为图片)
      const validateAvatar = async (avatarUrl) => {
        if (!avatarUrl) return false;
        
        try {
          new URL(avatarUrl); // 验证 URL 格式
          
          const headResponse = await fetch(avatarUrl, { method: 'HEAD' });
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
                p {
                  margin: 15px 0;
                  line-height: 1.6;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>🎨 聊天室后端运行正常</h1>
                <p>这是 API 服务，请配合前端使用。</p>
                <p><strong>管理员账号：</strong>用户名 <code>xiyue</code>，密码 <code>20090327qi</code></p>
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
            return new Response(JSON.stringify({ error: '无效的头像 URL 或不是图片格式' }), { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          const userKey = `user:${username}`;
          const existingUser = await env.USERS_KV.get(userKey, { type: 'json' });
          if (existingUser) {
            return new Response(JSON.stringify({ error: '用户名已存在' }), { 
              status: 409,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          const newUser = {
            username,
            password,
            nickname,
            avatar,
            isAdmin: false,
            createdAt: new Date().toISOString(),
            isMuted: false
          };
          
          await env.USERS_KV.put(userKey, JSON.stringify(newUser));
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
          const user = await env.USERS_KV.get(userKey, { type: 'json' });
          
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
          // 获取所有消息
          let messages = [];
          let cursor = null;
          
          do {
            const list = await env.MESSAGES_KV.list({ prefix: 'message:', cursor });
            cursor = list.cursor;
            
            for (const key of list.keys) {
              const msg = await env.MESSAGES_KV.get(key.name, { type: 'json' });
              if (msg) {
                messages.push({
                  ...msg,
                  _id: key.name.replace('message:', ''),
                  message: decryptMessage(msg.message)
                });
              }
            }
          } while (cursor);
          
          // 按时间排序，取最近50条
          messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          messages = messages.slice(-50);
          
          return new Response(JSON.stringify(messages), { 
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
          const user = await env.USERS_KV.get(userKey, { type: 'json' });
          
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
          
          // 生成唯一消息ID
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
          
          await env.MESSAGES_KV.put(messageKey, JSON.stringify(newMessage));
          
          return new Response(JSON.stringify({ success: true }), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 获取用户列表
        async '/user-list'() {
          let users = [];
          let cursor = null;
          
          do {
            const list = await env.USERS_KV.list({ prefix: 'user:', cursor });
            cursor = list.cursor;
            
            for (const key of list.keys) {
              const user = await env.USERS_KV.get(key.name, { type: 'json' });
              if (user) {
                const { password, ...userWithoutPassword } = user;
                users.push(userWithoutPassword);
              }
            }
          } while (cursor);
          
          return new Response(JSON.stringify(users), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 获取自动清除时间
        async '/get-clear-time'() {
          const clearTimeKey = "config:clearTime";
          const clearTime = await env.CONFIG_KV.get(clearTimeKey) || "0";
          
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
          
          const clearTimeKey = "config:clearTime";
          await env.CONFIG_KV.put(clearTimeKey, time.toString());
          
          return new Response(JSON.stringify({ success: true }), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 清除所有消息
        async '/clear-messages'() {
          let cursor = null;
          
          do {
            const list = await env.MESSAGES_KV.list({ prefix: 'message:', cursor });
            cursor = list.cursor;
            
            for (const key of list.keys) {
              await env.MESSAGES_KV.delete(key.name);
            }
          } while (cursor);
          
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
          const user = await env.USERS_KV.get(userKey, { type: 'json' });
          
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
          
          await env.USERS_KV.put(userKey, JSON.stringify({ 
            ...user, 
            isMuted: true 
          }));
          
          // 更新禁言列表
          const muteListKey = "config:muteList";
          let muteList = await env.CONFIG_KV.get(muteListKey, { type: 'json' }) || [];
          if (!muteList.includes(username)) {
            muteList.push(username);
            await env.CONFIG_KV.put(muteListKey, JSON.stringify(muteList));
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
          const user = await env.USERS_KV.get(userKey, { type: 'json' });
          
          if (!user) {
            return new Response(JSON.stringify({ error: '用户不存在' }), { 
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          await env.USERS_KV.put(userKey, JSON.stringify({ 
            ...user, 
            isMuted: false 
          }));
          
          // 更新禁言列表
          const muteListKey = "config:muteList";
          let muteList = await env.CONFIG_KV.get(muteListKey, { type: 'json' }) || [];
          muteList = muteList.filter(u => u !== username);
          await env.CONFIG_KV.put(muteListKey, JSON.stringify(muteList));
          
          return new Response(JSON.stringify({ success: true }), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 获取禁言列表
        async '/get-mute-list'() {
          const muteListKey = "config:muteList";
          const muteList = await env.CONFIG_KV.get(muteListKey, { type: 'json' }) || [];
          
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
          const user = await env.USERS_KV.get(userKey, { type: 'json' });
          
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
          
          await env.USERS_KV.delete(userKey);
          
          return new Response(JSON.stringify({ success: true }), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 更新头像
        async '/update-avatar'(request) {
          const { username, avatar } = await request.json();
          
          if (!username || !avatar) {
            return new Response(JSON.stringify({ error: '缺少用户名或头像' }), { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          if (!(await validateAvatar(avatar))) {
            return new Response(JSON.stringify({ error: '无效的头像 URL 或不是图片格式' }), { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          const userKey = `user:${username}`;
          const user = await env.USERS_KV.get(userKey, { type: 'json' });
          
          if (!user) {
            return new Response(JSON.stringify({ error: '用户不存在' }), { 
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          // 保存旧头像，如果需要实现删除逻辑，可以在这里记录
          const oldAvatar = user.avatar;
          
          // 更新用户头像
          await env.USERS_KV.put(userKey, JSON.stringify({ 
            ...user, 
            avatar: avatar 
          }));
          
          return new Response(JSON.stringify({ success: true }), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 更新密码
        async '/update-password'(request) {
          const { username, oldPassword, newPassword } = await request.json();
          
          if (!username || !oldPassword || !newPassword) {
            return new Response(JSON.stringify({ error: '缺少用户名、旧密码或新密码' }), { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          const userKey = `user:${username}`;
          const user = await env.USERS_KV.get(userKey, { type: 'json' });
          
          if (!user) {
            return new Response(JSON.stringify({ error: '用户不存在' }), { 
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          if (user.password !== oldPassword) {
            return new Response(JSON.stringify({ error: '旧密码错误' }), { 
              status: 401,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          // 更新用户密码
          await env.USERS_KV.put(userKey, JSON.stringify({ 
            ...user, 
            password: newPassword 
          }));
          
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
      if (!env.MESSAGES_KV || !env.CONFIG_KV) {
        console.error("定时任务: 缺少 KV 命名空间配置");
        return;
      }

      // 获取自动清除时间
      const clearTimeKey = "config:clearTime";
      const clearTime = parseInt(await env.CONFIG_KV.get(clearTimeKey) || "0");
      
      if (clearTime > 0) {
        const cutoffDate = new Date(Date.now() - clearTime);
        
        let cursor = null;
        let deletedCount = 0;
        
        do {
          const list = await env.MESSAGES_KV.list({ prefix: 'message:', cursor });
          cursor = list.cursor;
          
          for (const key of list.keys) {
            const msg = await env.MESSAGES_KV.get(key.name, { type: 'json' });
            if (msg && new Date(msg.timestamp) < cutoffDate) {
              await env.MESSAGES_KV.delete(key.name);
              deletedCount++;
            }
          }
        } while (cursor);
        
        console.log(`定时任务: 已清除 ${cutoffDate.toISOString()} 之前的消息，共 ${deletedCount} 条`);
      } else {
          console.log("定时任务: 自动清除时间设置为 0，跳过清理。");
      }
    } catch (error) {
      console.error("定时任务错误:", error);
    }
  }
};
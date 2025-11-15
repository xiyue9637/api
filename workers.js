// 注意：此代码示例假设您已启用并配置了 MongoDB Atlas Data API
// 您需要在 MongoDB Atlas 中获取您的 Project ID, Cluster Name, API Key
// 这些信息不应硬编码在代码中，而应通过环境变量传递

// 从环境变量获取 MongoDB Atlas Data API 配置
// 这些变量需要在 Cloudflare Workers 仪表板中设置
// MONGODB_DATA_API_PROJECT_ID
// MONGODB_DATA_API_CLUSTER_NAME
// MONGODB_DATA_API_KEY
// MONGODB_DATA_API_BASE_URL (通常是 https://data.mongodb-api.com/app/data-<your-app-id>/endpoint/data/v1)

// 示例配置 (请替换为您的实际值，并通过环境变量传递)
// const MONGODB_DATA_API_BASE_URL = env.MONGODB_DATA_API_BASE_URL;
// const MONGODB_DATA_API_PROJECT_ID = env.MONGODB_DATA_API_PROJECT_ID;
// const MONGODB_DATA_API_CLUSTER_NAME = env.MONGODB_DATA_API_CLUSTER_NAME;
// const MONGODB_DATA_API_KEY = env.MONGODB_DATA_API_KEY;

// 为了演示，我们定义一个函数来构建 API 调用
async function callMongoDBAPI(collection, operation, query = {}, update = {}, document = {}, options = {}) {
    const MONGODB_DATA_API_BASE_URL = env.MONGODB_DATA_API_BASE_URL;
    const MONGODB_DATA_API_PROJECT_ID = env.MONGODB_DATA_API_PROJECT_ID;
    const MONGODB_DATA_API_CLUSTER_NAME = env.MONGODB_DATA_API_CLUSTER_NAME;
    const MONGODB_DATA_API_KEY = env.MONGODB_DATA_API_KEY;

    if (!MONGODB_DATA_API_BASE_URL || !MONGODB_DATA_API_PROJECT_ID || !MONGODB_DATA_API_CLUSTER_NAME || !MONGODB_DATA_API_KEY) {
        throw new Error("Missing MongoDB Data API configuration in environment variables.");
    }

    const url = `${MONGODB_DATA_API_BASE_URL}/action/${operation}`;
    const headers = {
        'Content-Type': 'application/json',
        'api-key': MONGODB_DATA_API_KEY,
    };

    const body = JSON.stringify({
        dataSource: MONGODB_DATA_API_CLUSTER_NAME,
        database: "chat_app", // 固定数据库名
        collection: collection,
        ...query,
        ...update,
        ...document,
        ...options,
    });

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: body,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`MongoDB API Error: ${response.status} - ${errorText}`);
            throw new Error(`MongoDB API Error: ${response.status} - ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("MongoDB API Call Failed:", error);
        throw error;
    }
}

// 移除 Node.js 驱动的 import
// import { MongoClient } from 'mongodb';

export default {
  async fetch(request, env) {
    // CORS 处理
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
      // 从环境变量获取配置
      // const MONGODB_URI = env.MONGODB_URI; // 不再需要原始 URI
      const DB_NAME = "chat_app";
      const COLLECTIONS = {
        USERS: "users",
        MESSAGES: "messages",
        CONFIG: "config"
      };

      // 邀请码
      const INVITE_CODE = "xiyue520";

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
        // 使用 Data API 查找管理员
        const findAdminResult = await callMongoDBAPI(
            COLLECTIONS.USERS,
            'findOne',
            { filter: { username: "xiyue" } }
        );
        if (!findAdminResult.document) {
          const admin = {
            username: "xiyue",
            password: "20090327qi", // 实际生产中应哈希存储
            nickname: "管理员",
            avatar: "https://i.pravatar.cc/150?u=admin",
            isAdmin: true,
            createdAt: new Date(),
            isMuted: false
          };

          await callMongoDBAPI(
              COLLECTIONS.USERS,
              'insertOne',
              {},
              {},
              { document: admin }
          );
          console.log("管理员用户 'xiyue' 已创建");
        }
      };

      // 初始化配置
      const initConfig = async () => {
        const findConfigResult = await callMongoDBAPI(
            COLLECTIONS.CONFIG,
            'findOne',
            { filter: { key: "messageClearTime" } }
        );
        if (!findConfigResult.document) {
          await callMongoDBAPI(
              COLLECTIONS.CONFIG,
              'insertOne',
              {},
              {},
              { document: { key: "messageClearTime", value: 0, updatedAt: new Date() } }
          );
          console.log("自动清除时间配置已初始化");
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

          // 检查用户是否存在
          const findUserResult = await callMongoDBAPI(
              COLLECTIONS.USERS,
              'findOne',
              { filter: { username: username } }
          );
          if (findUserResult.document) {
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
            createdAt: new Date(),
            isMuted: false
          };

          await callMongoDBAPI(
              COLLECTIONS.USERS,
              'insertOne',
              {},
              {},
              { document: newUser }
          );
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

          const findUserResult = await callMongoDBAPI(
              COLLECTIONS.USERS,
              'findOne',
              { filter: { username: username, password: password } }
          );

          if (!findUserResult.document) {
            return new Response(JSON.stringify({ error: '用户名或密码错误' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          // 返回用户信息 (不包含密码)
          const userWithoutPassword = { ...findUserResult.document };
          delete userWithoutPassword.password;
          return new Response(JSON.stringify({ user: userWithoutPassword }), {
            headers: { 'Content-Type': 'application/json' }
          });
        },

        // 获取消息
        async '/messages'() {
          // 使用 Data API 获取最近50条消息，按时间升序
          const findMessagesResult = await callMongoDBAPI(
              COLLECTIONS.MESSAGES,
              'find',
              { filter: {}, sort: { timestamp: 1 }, limit: 50 }
          );

          const messages = findMessagesResult.documents || [];

          // 解密消息内容
          const decryptedMessages = messages.map(msg => ({
            ...msg,
            _id: msg._id.$oid, // MongoDB Data API 返回的 ObjectId 格式
            message: decryptMessage(msg.message)
          }));

          return new Response(JSON.stringify(decryptedMessages), { // 不再反转
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

          const findUserResult = await callMongoDBAPI(
              COLLECTIONS.USERS,
              'findOne',
              { filter: { username: username } }
          );

          if (!findUserResult.document) {
            return new Response(JSON.stringify({ error: '用户不存在' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          if (findUserResult.document.isMuted) {
            return new Response(JSON.stringify({ error: '您已被禁言，无法发送消息' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          // 加密消息
          const encryptedMessage = encryptMessage(message);

          // 保存消息
          const newMessage = {
            username: findUserResult.document.username,
            nickname: findUserResult.document.nickname,
            avatar: findUserResult.document.avatar,
            message: encryptedMessage,
            timestamp: new Date()
          };

          await callMongoDBAPI(
              COLLECTIONS.MESSAGES,
              'insertOne',
              {},
              {},
              { document: newMessage }
          );

          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        },

        // 获取用户列表
        async '/user-list'() {
          const findUsersResult = await callMongoDBAPI(
              COLLECTIONS.USERS,
              'find',
              { filter: {} }
          );

          const users = findUsersResult.documents || [];

          // 不返回密码
          const usersWithoutPassword = users.map(user => {
            const userWithoutPassword = { ...user };
            delete userWithoutPassword.password;
            userWithoutPassword.id = userWithoutPassword._id.$oid; // 转换 ObjectId
            delete userWithoutPassword._id;
            return userWithoutPassword;
          });

          return new Response(JSON.stringify(usersWithoutPassword), {
            headers: { 'Content-Type': 'application/json' }
          });
        },

        // 获取自动清除时间
        async '/get-clear-time'() {
          const findConfigResult = await callMongoDBAPI(
              COLLECTIONS.CONFIG,
              'findOne',
              { filter: { key: "messageClearTime" } }
          );

          return new Response(JSON.stringify({ time: findConfigResult.document?.value || 0 }), {
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

          await callMongoDBAPI(
              COLLECTIONS.CONFIG,
              'updateOne',
              { filter: { key: "messageClearTime" } },
              { update: { $set: { value: time, updatedAt: new Date() } } }
          );

          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        },

        // 清除所有消息
        async '/clear-messages'() {
          await callMongoDBAPI(
              COLLECTIONS.MESSAGES,
              'deleteMany',
              { filter: {} }
          );

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

          const findUserResult = await callMongoDBAPI(
              COLLECTIONS.USERS,
              'findOne',
              { filter: { username: username } }
          );

          if (!findUserResult.document) {
            return new Response(JSON.stringify({ error: '用户不存在' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          // 不能禁言管理员
          if (findUserResult.document.username === "xiyue") {
            return new Response(JSON.stringify({ error: '不能禁言管理员' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          await callMongoDBAPI(
              COLLECTIONS.USERS,
              'updateOne',
              { filter: { username: username } },
              { update: { $set: { isMuted: true } } }
          );

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

          const findUserResult = await callMongoDBAPI(
              COLLECTIONS.USERS,
              'findOne',
              { filter: { username: username } }
          );

          if (!findUserResult.document) {
            return new Response(JSON.stringify({ error: '用户不存在' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          await callMongoDBAPI(
              COLLECTIONS.USERS,
              'updateOne',
              { filter: { username: username } },
              { update: { $set: { isMuted: false } } }
          );

          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        },

        // 获取禁言列表
        async '/get-mute-list'() {
          const findMutedUsersResult = await callMongoDBAPI(
              COLLECTIONS.USERS,
              'find',
              { filter: { isMuted: true }, projection: { username: 1 } }
          );

          const mutedUsers = findMutedUsersResult.documents || [];

          return new Response(JSON.stringify({
            users: mutedUsers.map(u => u.username)
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

          const findUserResult = await callMongoDBAPI(
              COLLECTIONS.USERS,
              'findOne',
              { filter: { username: username } }
          );

          if (!findUserResult.document) {
            return new Response(JSON.stringify({ error: '用户不存在' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          // 不能移除管理员
          if (findUserResult.document.username === "xiyue") {
            return new Response(JSON.stringify({ error: '不能移除管理员' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          await callMongoDBAPI(
              COLLECTIONS.USERS,
              'deleteOne',
              { filter: { username: username } }
          );

          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      };

      // 处理请求
      let response;
      if (path in apiHandlers) {
        response = await apiHandlers[path](request, env); // 传递 env
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

  // 定时任务使用 Data API 清理消息
  async scheduled(event, env, ctx) {
    try {
      const MONGODB_DATA_API_BASE_URL = env.MONGODB_DATA_API_BASE_URL;
      const MONGODB_DATA_API_PROJECT_ID = env.MONGODB_DATA_API_PROJECT_ID;
      const MONGODB_DATA_API_CLUSTER_NAME = env.MONGODB_DATA_API_CLUSTER_NAME;
      const MONGODB_DATA_API_KEY = env.MONGODB_DATA_API_KEY;

      if (!MONGODB_DATA_API_BASE_URL || !MONGODB_DATA_API_PROJECT_ID || !MONGODB_DATA_API_CLUSTER_NAME || !MONGODB_DATA_API_KEY) {
          console.error("定时任务: 缺少 MongoDB Data API 配置");
          return;
      }

      // 获取自动清除时间
      const findConfigResult = await callMongoDBAPI(
          "config", // COLLECTIONS.CONFIG
          'findOne',
          { filter: { key: "messageClearTime" } },
          {},
          {},
          {},
          env // 传递 env
      );

      const clearTime = findConfigResult.document?.value || 0;
      if (clearTime > 0) {
        const cutoffDate = new Date(Date.now() - clearTime);

        // 使用 Data API 删除过期消息
        const deleteResult = await callMongoDBAPI(
            "messages", // COLLECTIONS.MESSAGES
            'deleteMany',
            { filter: { timestamp: { $lt: { $date: cutoffDate.toISOString() } } } },
            {},
            {},
            {},
            env // 传递 env
        );

        console.log(`定时任务: 已清除 ${cutoffDate.toISOString()} 之前的消息，共 ${deleteResult.deletedCount} 条`);
      } else {
          console.log("定时任务: 自动清除时间设置为 0，跳过清理。");
      }

    } catch (error) {
      console.error("定时任务错误:", error);
    }
  }
};
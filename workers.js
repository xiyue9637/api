// workers.js
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
      const MONGODB_URI = env.MONGODB_URI;
      const DB_NAME = "chat_app";
      const COLLECTIONS = {
        USERS: "users",
        MESSAGES: "messages",
        CONFIG: "config"
      };

      if (!MONGODB_URI) {
        throw new Error("Missing database configuration");
      }

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
          return encryptedMessage;
        }
      };

      // MongoDB 连接
      let client, db;
      try {
        client = new MongoClient(MONGODB_URI, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
        });
        await client.connect();
        db = client.db(DB_NAME);
      } catch (error) {
        console.error("MongoDB 连接失败:", error);
        return new Response(JSON.stringify({ error: '数据库连接失败' }), { status: 500 });
      }

      // 初始化管理员
      const initAdminUser = async () => {
        const usersCollection = db.collection(COLLECTIONS.USERS);
        const adminUser = await usersCollection.findOne({ username: "xiyue" });
        
        if (!adminUser) {
          const admin = {
            username: "xiyue",
            password: "20090327qi",
            nickname: "管理员",
            avatar: "https://i.pravatar.cc/150?u=admin",
            isAdmin: true,
            createdAt: new Date(),
            isMuted: false
          };
          
          await usersCollection.insertOne(admin);
          console.log("管理员用户已创建");
        }
      };

      // 初始化配置
      const initConfig = async () => {
        const configCollection = db.collection(COLLECTIONS.CONFIG);
        
        let clearTimeConfig = await configCollection.findOne({ key: "messageClearTime" });
        if (!clearTimeConfig) {
          await configCollection.insertOne({
            key: "messageClearTime",
            value: 0,
            updatedAt: new Date()
          });
          console.log("自动清除时间配置已初始化");
        }
        
        let muteListConfig = await configCollection.findOne({ key: "muteList" });
        if (!muteListConfig) {
          await configCollection.insertOne({
            key: "muteList",
            value: [],
            updatedAt: new Date()
          });
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

      // 验证头像
      const validateAvatar = async (avatarUrl) => {
        if (!avatarUrl) return false;
        
        try {
          new URL(avatarUrl);
          
          const headResponse = await fetch(avatarUrl, { method: 'HEAD' });
          const contentLength = headResponse.headers.get('content-length');
          
          if (!contentLength || parseInt(contentLength) > 2 * 1024 * 1024) {
            return false;
          }
          
          const contentType = headResponse.headers.get('content-type');
          return contentType && contentType.startsWith('image/');
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
          
          const usersCollection = db.collection(COLLECTIONS.USERS);
          const existingUser = await usersCollection.findOne({ username });
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
            createdAt: new Date(),
            isMuted: false
          };
          
          await usersCollection.insertOne(newUser);
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
          
          const usersCollection = db.collection(COLLECTIONS.USERS);
          const user = await usersCollection.findOne({ username, password }); // 实际应用应比对哈希
          
          if (!user) {
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
          const messagesCollection = db.collection(COLLECTIONS.MESSAGES);
          const messages = await messagesCollection.find().sort({ timestamp: -1 }).limit(50).toArray();
          
          // 解密消息内容
          const decryptedMessages = messages.map(msg => ({
            ...msg,
            _id: msg._id.toString(),
            message: decryptMessage(msg.message)
          }));
          
          return new Response(JSON.stringify(decryptedMessages.reverse()), { 
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
          
          const usersCollection = db.collection(COLLECTIONS.USERS);
          const user = await usersCollection.findOne({ username });
          
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
          
          // 保存消息
          const messagesCollection = db.collection(COLLECTIONS.MESSAGES);
          await messagesCollection.insertOne({
            username: user.username,
            nickname: user.nickname,
            avatar: user.avatar,
            message: encryptedMessage,
            timestamp: new Date()
          });
          
          return new Response(JSON.stringify({ success: true }), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 获取用户列表
        async '/user-list'() {
          const usersCollection = db.collection(COLLECTIONS.USERS);
          const users = await usersCollection.find({}).toArray();
          
          // 不返回密码
          const usersWithoutPassword = users.map(user => {
            const { password, _id, ...userWithoutPassword } = user;
            return { ...userWithoutPassword, id: _id.toString() };
          });
          
          return new Response(JSON.stringify(usersWithoutPassword), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 获取自动清除时间
        async '/get-clear-time'() {
          const configCollection = db.collection(COLLECTIONS.CONFIG);
          const clearTimeConfig = await configCollection.findOne({ key: "messageClearTime" });
          
          return new Response(JSON.stringify({ time: clearTimeConfig?.value || 0 }), { 
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
          
          const configCollection = db.collection(COLLECTIONS.CONFIG);
          await configCollection.updateOne(
            { key: "messageClearTime" },
            { $set: { value: time, updatedAt: new Date() } }
          );
          
          return new Response(JSON.stringify({ success: true }), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 清除所有消息
        async '/clear-messages'() {
          const messagesCollection = db.collection(COLLECTIONS.MESSAGES);
          await messagesCollection.deleteMany({});
          
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
          
          const usersCollection = db.collection(COLLECTIONS.USERS);
          const user = await usersCollection.findOne({ username });
          
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
          
          await usersCollection.updateOne(
            { username },
            { $set: { isMuted: true } }
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
          
          const usersCollection = db.collection(COLLECTIONS.USERS);
          const user = await usersCollection.findOne({ username });
          
          if (!user) {
            return new Response(JSON.stringify({ error: '用户不存在' }), { 
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          await usersCollection.updateOne(
            { username },
            { $set: { isMuted: false } }
          );
          
          return new Response(JSON.stringify({ success: true }), { 
            headers: { 'Content-Type': 'application/json' }
          });
        },
        
        // 获取禁言列表
        async '/get-mute-list'() {
          const usersCollection = db.collection(COLLECTIONS.USERS);
          const mutedUsers = await usersCollection.find({ isMuted: true }).toArray();
          
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
          
          const usersCollection = db.collection(COLLECTIONS.USERS);
          const user = await usersCollection.findOne({ username });
          
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
          
          await usersCollection.deleteOne({ username });
          
          return new Response(JSON.stringify({ success: true }), { 
            headers: { 'Content-Type': 'application/json' }
          });
        }
      };

      // 处理请求
      let response;
      if (path in apiHandlers) {
        response = await apiHandlers[path](request);
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

      // 关闭数据库连接
      if (client) {
        await client.close();
      }

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

  async scheduled(event, env) {
    try {
      const MONGODB_URI = env.MONGODB_URI;
      const DB_NAME = "chat_app";
      const COLLECTIONS = {
        MESSAGES: "messages",
        CONFIG: "config"
      };

      if (!MONGODB_URI) {
        throw new Error("Missing database configuration for scheduled event");
      }

      // 连接 MongoDB
      const client = new MongoClient(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      await client.connect();
      const db = client.db(DB_NAME);

      // 获取自动清除时间
      const configCollection = db.collection(COLLECTIONS.CONFIG);
      const clearTimeConfig = await configCollection.findOne({ key: "messageClearTime" });
      
      const clearTime = clearTimeConfig?.value || 0;
      if (clearTime > 0) {
        const cutoffDate = new Date(Date.now() - clearTime);
        
        const messagesCollection = db.collection(COLLECTIONS.MESSAGES);
        const result = await messagesCollection.deleteMany({
          timestamp: { $lt: cutoffDate }
        });
        
        console.log(`定时任务: 已清除 ${cutoffDate} 之前的消息，共 ${result.deletedCount} 条`);
      }

      // 关闭连接
      await client.close();
    } catch (error) {
      console.error("定时任务错误:", error);
    }
  }
};

// 在 Cloudflare Workers 环境中模拟 MongoDB
class MongoClient {
  constructor(uri, options) {
    this.uri = uri;
    this.options = options;
  }

  async connect() {
    // 这里需要使用 Cloudflare Workers 兼容的 MongoDB 连接方式
    // 实际部署时使用 @mongodb/atlas 库
  }

  db(name) {
    return new Db(name);
  }

  async close() {
    // 关闭连接
  }
}

class Db {
  constructor(name) {
    this.name = name;
  }

  collection(name) {
    return new Collection(name);
  }
}

class Collection {
  constructor(name) {
    this.name = name;
  }

  async findOne(filter) {
    // 模拟实现
    return null;
  }

  async find(filter = {}) {
    // 模拟实现
    return {
      toArray: async () => [],
      sort: () => this,
      limit: () => this
    };
  }

  async insertOne(doc) {
    // 模拟实现
  }

  async updateOne(filter, update) {
    // 模拟实现
  }

  async deleteMany(filter = {}) {
    // 模拟实现
    return { deletedCount: 0 };
  }

  async deleteOne(filter) {
    // 模拟实现
  }
}
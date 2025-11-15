// script.js - 莫奈聊天室前端逻辑
// 后端 API 地址已根据您当前部署的 Worker 设置
const API_BASE_URL = 'https://monet-chat-api.guzhou330.workers.dev'; // 修改为当前 Worker 地址
// --- DOM 元素缓存 ---
let currentUser = null;
let messagePollingInterval = null;
let isMuted = false; // 用于跟踪用户是否被禁言
let originalUserList = []; // 保存原始用户列表，用于搜索

// 等待 DOM 加载完成
document.addEventListener('DOMContentLoaded', () => {
    // 缓存 DOM 元素
    const authSection = document.getElementById('auth-section');
    const chatSection = document.getElementById('chat-section');
    const adminPanel = document.getElementById('admin-panel');
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const sendBtn = document.getElementById('send-btn');
    const messageInput = document.getElementById('message-input');
    const messagesContainer = document.getElementById('messages-container');
    const userList = document.getElementById('user-list');
    const clearTimeSelect = document.getElementById('clear-time-select');
    const applyClearTimeBtn = document.getElementById('apply-clear-time-btn');
    const clearAllMessagesBtn = document.getElementById('clear-all-messages-btn');
    const userNicknameSpan = document.getElementById('user-nickname');
    const welcomeMessage = document.getElementById('welcome-message');
    const userSearch = document.getElementById('user-search');
    const searchBtn = document.getElementById('search-btn');
    const resetSearchBtn = document.getElementById('reset-search-btn');
    
    // --- 工具函数 ---
    function showSection(sectionToShow) {
        document.querySelectorAll('.section').forEach(section => {
            section.classList.add('hidden');
        });
        sectionToShow.classList.remove('hidden');
    }
    
    function switchForm(formToShow) {
        document.querySelectorAll('.form').forEach(form => {
            form.classList.remove('active');
        });
        formToShow.classList.add('active');
    }
    
    function showError(elementId, message) {
        const errorElement = document.getElementById(elementId);
        if (errorElement) {
            errorElement.textContent = message;
        }
    }
    
    function clearErrors() {
        document.querySelectorAll('.error-message').forEach(el => {
            el.textContent = '';
        });
    }
    
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "<")
            .replace(/>/g, ">")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    // --- 邀请码验证函数 ---
    function validateInviteCode(inviteCode) {
        return inviteCode && inviteCode.toLowerCase() === 'xiyue520';
    }
    
    // --- 头像验证函数 (前端简单检查) ---
    async function validateAvatarSize(avatarUrl) {
        if (!avatarUrl) return false;
        try {
            // 使用 HEAD 请求获取头像大小信息
            const response = await fetch(avatarUrl, { method: 'HEAD' });
            const contentLength = response.headers.get('content-length');
            if (!contentLength) {
                // 如果服务器不返回 Content-Length，无法判断
                console.warn("无法确定头像大小，服务器可能未返回 Content-Length 头");
                return true; // 允许继续，后端会再次验证
            }
            const sizeInBytes = parseInt(contentLength);
            const sizeInMB = sizeInBytes / (1024 * 1024);
            return sizeInMB <= 2; // 限制 2MB
        } catch (error) {
            console.error("验证头像大小失败:", error);
            return false;
        }
    }
    
    // --- API 调用函数 ---
    async function apiCall(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        // 确保 headers 对象存在
        const config = {
            method: 'GET', // 默认为 GET
            headers: {
                'Content-Type': 'application/json'
            },
            ...options
        };
        try {
            console.log(`[API Call] ${config.method} ${url}`, options.body ? `Body: ${options.body}` : '');
            const response = await fetch(url, config);
            let data;
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                data = await response.json();
            } else {
                // 如果响应不是 JSON，尝试获取文本
                const text = await response.text();
                console.warn(`[API Call] Response for ${url} is not JSON:`, text);
                // 尝试解析为 JSON，如果失败则创建一个包含文本的错误对象
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    data = { error: `服务器返回非JSON响应: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}` };
                }
            }
            if (!response.ok) {
                // 将 HTTP 错误状态码和消息传递给调用者
                const error = new Error(data.error || `HTTP error! status: ${response.status}`);
                error.status = response.status;
                error.data = data;
                throw error;
            }
            console.log(`[API Call] Success ${url}`, data);
            return data;
        } catch (error) {
            console.error(`[API Call] Failed ${url}:`, error);
            // 重新抛出错误，让调用者处理
            throw error;
        }
    }
    
    // --- 认证逻辑 ---
    loginTab.addEventListener('click', () => {
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        switchForm(loginForm);
        clearErrors();
    });
    
    registerTab.addEventListener('click', () => {
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
        switchForm(registerForm);
        clearErrors();
    });
    
    loginBtn.addEventListener('click', async () => {
        clearErrors();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        if (!username || !password) {
            showError('login-error', '请输入用户名和密码');
            return;
        }
        try {
            // 明确指定 method 为 POST
            const data = await apiCall('/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });
            currentUser = data.user;
            localStorage.setItem('chatUser', JSON.stringify(currentUser));
            showChatInterface();
        } catch (error) {
            console.error("登录失败:", error);
            if (error.status) {
                // 服务器返回了错误响应
                showError('login-error', error.data?.error || `登录失败 (${error.status})`);
            } else {
                // 网络错误或其他异常
                showError('login-error', '网络错误或服务器无响应，请稍后重试。');
            }
        }
    });
    
    registerBtn.addEventListener('click', async () => {
        clearErrors();
        const username = document.getElementById('register-username').value.trim();
        const password = document.getElementById('register-password').value;
        const nickname = document.getElementById('register-nickname').value.trim();
        const avatar = document.getElementById('register-avatar').value.trim();
        const inviteCode = document.getElementById('register-invite').value.trim(); // 获取邀请码
        
        if (!username || !password || !nickname || !avatar || !inviteCode) {
            showError('register-error', '请填写所有字段');
            return;
        }
        
        // 验证邀请码
        if (!validateInviteCode(inviteCode)) {
            showError('register-error', '邀请码无效');
            return;
        }
        
        // 验证头像大小 (前端简单检查)
        if (!(await validateAvatarSize(avatar))) {
            showError('register-error', '头像文件过大 (最大 2MB)');
            return;
        }
        
        try {
            // 明确指定 method 为 POST
            await apiCall('/register', {
                method: 'POST',
                body: JSON.stringify({ username, password, nickname, avatar, inviteCode })
            });
            alert('注册成功！请登录。');
            // 自动切换到登录
            loginTab.click();
            document.getElementById('login-username').value = username;
            document.getElementById('login-password').value = password;
        } catch (error) {
            console.error("注册失败:", error);
            if (error.status) {
                showError('register-error', error.data?.error || `注册失败 (${error.status})`);
            } else {
                showError('register-error', '网络错误或服务器无响应，请稍后重试。');
            }
        }
    });
    
    logoutBtn.addEventListener('click', () => {
        currentUser = null;
        localStorage.removeItem('chatUser');
        clearInterval(messagePollingInterval);
        messagePollingInterval = null; // 重置 interval ID
        showSection(authSection);
        // 清空表单
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
        document.getElementById('register-username').value = '';
        document.getElementById('register-password').value = '';
        document.getElementById('register-nickname').value = '';
        document.getElementById('register-avatar').value = '';
        document.getElementById('register-invite').value = ''; // 清空邀请码
        clearErrors();
    });
    
    // --- 聊天逻辑 ---
    function showChatInterface() {
        if (!currentUser) {
            console.error("showChatInterface called but currentUser is null");
            showSection(authSection);
            return;
        }
        userNicknameSpan.textContent = escapeHtml(currentUser.nickname);
        welcomeMessage.style.display = 'block'; // 确保欢迎信息显示
        showSection(chatSection);
        loadMessages();
        // 只有在没有运行时才启动轮询
        if (!messagePollingInterval) {
            messagePollingInterval = setInterval(loadMessages, 3000); // 每3秒刷新一次
        }
        // 管理员特殊处理 - 检查用户名是否为 'xiyue'
        if (currentUser.username === 'xiyue') {
            adminPanel.classList.remove('hidden');
            loadAdminPanel();
        } else {
            adminPanel.classList.add('hidden');
        }
        // 每次登录/重新显示聊天界面时，检查一次禁言状态
        checkMuteStatus();
    }
    
    async function checkMuteStatus() {
        try {
            const muteListData = await apiCall('/get-mute-list', { method: 'GET' });
            const muteList = muteListData.users || [];
            isMuted = muteList.includes(currentUser.username);
            const messageInput = document.getElementById('message-input');
            const sendBtn = document.getElementById('send-btn');
            if (isMuted) {
                messageInput.disabled = true;
                sendBtn.disabled = true;
                messageInput.placeholder = "您已被禁言";
            } else {
                messageInput.disabled = false;
                sendBtn.disabled = false;
                messageInput.placeholder = "输入消息...";
            }
        } catch (error) {
            console.error("检查禁言状态失败:", error);
            // 即使检查失败，也允许用户尝试发送消息
        }
    }
    
    async function loadMessages() {
        try {
            const data = await apiCall('/messages', { method: 'GET' });
            displayMessages(data);
        } catch (error) {
            console.error("加载消息失败:", error);
            // 可以选择在界面上提示用户，但不要中断轮询
        }
    }
    
    function displayMessages(messages) {
        if (!messagesContainer) {
            console.error("Messages container not found");
            return;
        }
        messagesContainer.innerHTML = '';
        messages.forEach(msg => {
            const messageElement = document.createElement('div');
            // 确保 msg 对象存在所需属性
            const msgUsername = msg.username || '未知用户';
            const msgNickname = msg.nickname || msgUsername;
            const msgAvatar = msg.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(msgNickname.charAt(0));
            const msgMessage = msg.message || '';
            const msgTimestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '未知时间';
            
            // 使用 marked.js 渲染 Markdown，同时应用防XSS
            let renderedMessage;
            try {
                // marked.parse 可能包含HTML，需要再次sanitize
                renderedMessage = marked.parse(msgMessage);
                renderedMessage = sanitizeHTML(renderedMessage);
            } catch (e) {
                console.error("Markdown解析失败:", e);
                // 如果解析失败，回退到纯文本转义
                renderedMessage = escapeHtml(msgMessage);
            }
            
            messageElement.className = `message ${msgUsername === currentUser?.username ? 'own' : ''}`;
            messageElement.innerHTML = `
                <img class="avatar" src="${escapeHtml(msgAvatar)}" alt="Avatar" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(msgNickname)}&background=random';">
                <div>
                    <div class="content">${renderedMessage}</div>
                    <div class="info">${escapeHtml(msgNickname)} - ${escapeHtml(msgTimestamp)}</div>
                </div>
            `;
            messagesContainer.appendChild(messageElement);
        });
        // 滚动到底部
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    async function sendMessage() {
        if (!currentUser) {
            alert("请先登录");
            return;
        }
        const message = messageInput.value.trim();
        if (!message) return;
        try {
            // 明确指定 method 为 POST
            await apiCall('/send', {
                method: 'POST',
                body: JSON.stringify({ username: currentUser.username, message })
            });
            messageInput.value = '';
            // 立即刷新消息
            await loadMessages();
        } catch (error) {
            console.error("发送消息失败:", error);
            if (error.status === 403 && error.data?.error?.includes("禁言")) {
                 // 特殊处理禁言错误
                 alert("发送失败: " + error.data.error);
                 isMuted = true; // 更新本地禁言状态
                 messageInput.disabled = true;
                 sendBtn.disabled = true;
                 messageInput.placeholder = "您已被禁言";
            } else if (error.status) {
                alert("发送消息失败: " + (error.data?.error || `错误 (${error.status})`));
            } else {
                alert("发送消息失败: 网络错误或服务器无响应");
            }
        }
    }
    
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // 防止换行
            sendMessage();
        }
    });
    
    // --- 管理员逻辑 ---
    async function loadAdminPanel() {
        if (currentUser?.username !== 'xiyue') { // 修改为 'xiyue'
             console.warn("非管理员用户尝试加载管理员面板");
             return;
        }
        try {
            const [clearTimeData, usersData] = await Promise.all([
                apiCall('/get-clear-time', { method: 'GET' }),
                apiCall('/user-list', { method: 'GET' })
            ]);
            clearTimeSelect.value = clearTimeData.time || '0';
            originalUserList = [...usersData];
            displayUserList(usersData);
        } catch (error) {
            console.error("加载管理员面板失败:", error);
            alert("加载管理员面板失败: " + (error.message || "未知错误"));
        }
    }
    
    function displayUserList(users) {
        if (!userList) {
            console.error("User list container not found");
            return;
        }
        userList.innerHTML = '';
        users.forEach(user => {
            // 管理员不应该在用户列表中看到自己，或者可以管理自己（取决于需求）
            // 这里我们允许管理员看到自己，但不能操作自己
            if (user.username === 'xiyue') return; // 不显示管理员自己或允许操作
            const li = document.createElement('li');
            const isMuted = user.isMuted || false; // 从后端获取禁言状态
            
            li.innerHTML = `
                <span>${escapeHtml(user.nickname)} (@${escapeHtml(user.username)}) ${isMuted ? '<span style="color: var(--accent-2);">[已禁言]</span>' : ''}</span>
                <div class="user-actions">
                    ${isMuted ? 
                      `<button onclick="window.unmuteUser('${user.username}')" aria-label="解禁 ${escapeHtml(user.username)}">解禁</button>` :
                      `<button onclick="window.muteUser('${user.username}')" aria-label="禁言 ${escapeHtml(user.username)}">禁言</button>`
                    }
                    <button onclick="window.removeUser('${user.username}')" aria-label="移除 ${escapeHtml(user.username)}">移除</button>
                </div>
            `;
            userList.appendChild(li);
        });
    }
    
    // 搜索功能
    searchBtn.addEventListener('click', () => {
        const searchTerm = userSearch.value.trim().toLowerCase();
        if (!searchTerm) return;
        
        const filteredUsers = originalUserList.filter(user => 
            user.username.toLowerCase().includes(searchTerm) || 
            user.nickname.toLowerCase().includes(searchTerm)
        );
        
        displayUserList(filteredUsers);
    });
    
    resetSearchBtn.addEventListener('click', () => {
        userSearch.value = '';
        displayUserList(originalUserList);
    });
    
    applyClearTimeBtn.addEventListener('click', async () => {
        const time = clearTimeSelect.value;
        try {
            // 明确指定 method 为 POST
            await apiCall('/set-clear-time', {
                method: 'POST',
                body: JSON.stringify({ time: parseInt(time) })
            });
            alert('自动清除时间设置成功');
        } catch (error) {
            console.error("设置自动清除时间失败:", error);
            alert('设置失败: ' + (error.data?.error || error.message || "未知错误"));
        }
    });
    
    clearAllMessagesBtn.addEventListener('click', async () => {
        if (!confirm('确定要清除所有聊天记录吗？此操作不可逆。')) return;
        try {
            // 明确指定 method 为 POST
            await apiCall('/clear-messages', {
                method: 'POST'
            });
            loadMessages(); // 刷新消息列表
            alert('所有消息已清除');
        } catch (error) {
            console.error("清除所有消息失败:", error);
            alert('清除失败: ' + (error.data?.error || error.message || "未知错误"));
        }
    });
    
    // 暴露给全局作用域，供HTML内联onclick使用
    window.muteUser = async function(username) {
        if (username === 'xiyue') { // 修改为 'xiyue'
             alert("无法禁言管理员");
             return;
        }
        try {
            // 明确指定 method 为 POST
            await apiCall('/mute', {
                method: 'POST',
                body: JSON.stringify({ username })
            });
            alert(`用户 @${username} 已被禁言`);
            loadAdminPanel(); // 刷新用户列表
            // 如果禁言的是当前用户，更新界面
            if (currentUser && currentUser.username === username) {
                 isMuted = true;
                 const messageInput = document.getElementById('message-input');
                 const sendBtn = document.getElementById('send-btn');
                 if (messageInput && sendBtn) {
                     messageInput.disabled = true;
                     sendBtn.disabled = true;
                     messageInput.placeholder = "您已被禁言";
                 }
            }
        } catch (error) {
            console.error(`禁言用户 @${username} 失败:`, error);
            alert('禁言失败: ' + (error.data?.error || error.message || "未知错误"));
        }
    };
    
    window.unmuteUser = async function(username) {
        if (username === 'xiyue') { // 修改为 'xiyue'
             alert("无法操作管理员");
             return;
        }
        try {
            // 明确指定 method 为 POST
            await apiCall('/unmute', {
                method: 'POST',
                body: JSON.stringify({ username })
            });
            alert(`用户 @${username} 已被解禁`);
            loadAdminPanel(); // 刷新用户列表
            // 如果解禁的是当前用户，更新界面
            if (currentUser && currentUser.username === username) {
                 isMuted = false;
                 const messageInput = document.getElementById('message-input');
                 const sendBtn = document.getElementById('send-btn');
                 if (messageInput && sendBtn) {
                     messageInput.disabled = false;
                     sendBtn.disabled = false;
                     messageInput.placeholder = "输入消息...";
                 }
            }
        } catch (error) {
            console.error(`解禁用户 @${username} 失败:`, error);
            alert('解禁失败: ' + (error.data?.error || error.message || "未知错误"));
        }
    };
    
    window.removeUser = async function(username) {
        if (username === 'xiyue') { // 修改为 'xiyue'
             alert("无法移除管理员");
             return;
        }
        if (!confirm(`确定要移除用户 @${username} 吗？此操作不可逆。`)) return;
        try {
            // 明确指定 method 为 POST
            await apiCall('/remove', {
                method: 'POST',
                body: JSON.stringify({ username })
            });
            alert(`用户 @${username} 已被移除`);
            loadAdminPanel(); // 刷新用户列表
        } catch (error) {
            console.error(`移除用户 @${username} 失败:`, error);
            alert('移除失败: ' + (error.data?.error || error.message || "未知错误"));
        }
    };
    
    // --- 页面加载初始化 ---
    // 尝试从本地存储恢复登录状态
    const storedUser = localStorage.getItem('chatUser');
    if (storedUser) {
        try {
            currentUser = JSON.parse(storedUser);
            if (currentUser && currentUser.username) {
                showChatInterface(); // 如果有存储的用户信息，直接显示聊天界面
            } else {
                throw new Error("存储的用户信息不完整");
            }
        } catch (e) {
            console.error("解析存储的用户信息失败", e);
            localStorage.removeItem('chatUser');
            showSection(authSection);
        }
    } else {
        showSection(authSection);
    }
});
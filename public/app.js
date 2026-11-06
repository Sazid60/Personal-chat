// WhatsApp-Style Chat Application Controller
(() => {
  let token = localStorage.getItem('cipherchat_jwt');
  let currentUser = null;
  let socket = null;
  let webrtc = null;

  // Active Chat State
  let activeConversation = null; // { id, peer_id, peer_name, peer_email, peer_phone, isOnline }
  let conversations = [];
  let earliestTimestamp = null;
  let hasMoreHistory = true;
  let isLoadingHistory = false;
  let searchMatches = [];
  let currentSearchIndex = -1;

  // Call State
  let activeCall = null;
  let callTimerInterval = null;
  let callSeconds = 0;
  let pendingIncomingCall = null;

  // Media Recording State
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecordingVoice = false;
  let typingTimeout = null;

  // DOM Elements - Auth
  const authModal = document.getElementById('auth-modal');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const loginIdentifier = document.getElementById('login-identifier');
  const loginPassword = document.getElementById('login-password');
  const regName = document.getElementById('reg-name');
  const regEmail = document.getElementById('reg-email');
  const regPhone = document.getElementById('reg-phone');
  const regPassword = document.getElementById('reg-password');

  // DOM Elements - Main Layout
  const mainLayout = document.getElementById('main-layout');
  const sidebar = document.querySelector('.sidebar');
  const chatMain = document.getElementById('chat-main');
  const myName = document.getElementById('my-name');
  const btnLogout = document.getElementById('btn-logout');
  const btnOpenNewChat = document.getElementById('btn-open-new-chat');
  const globalSearchInput = document.getElementById('global-search-input');
  const searchResultsPanel = document.getElementById('search-results-panel');
  const searchResultsList = document.getElementById('search-results-list');
  const conversationsList = document.getElementById('conversations-list');

  // DOM Elements - Active Chat
  const noChatScreen = document.getElementById('no-chat-screen');
  const activeChatScreen = document.getElementById('active-chat-screen');
  const btnBackToSidebar = document.getElementById('btn-back-to-sidebar');
  const btnStartChatPrompt = document.getElementById('btn-start-chat-prompt');
  const activePeerName = document.getElementById('active-peer-name');
  const activePeerStatus = document.getElementById('active-peer-status');
  const activePeerStatusDot = document.getElementById('active-peer-status-dot');
  const btnStartAudioCall = document.getElementById('btn-start-audio-call');
  const btnStartVideoCall = document.getElementById('btn-start-video-call');
  const btnToggleSearch = document.getElementById('btn-toggle-search');
  const btnDeleteChat = document.getElementById('btn-delete-chat');

  // In-Chat Search Elements
  const inChatSearchBar = document.getElementById('in-chat-search-bar');
  const inChatSearchInput = document.getElementById('in-chat-search-input');
  const searchMatchCount = document.getElementById('search-match-count');
  const btnSearchPrev = document.getElementById('btn-search-prev');
  const btnSearchNext = document.getElementById('btn-search-next');
  const btnCloseSearch = document.getElementById('btn-close-search');

  // Viewport & Messages
  const messagesViewport = document.getElementById('messages-viewport');
  const messagesContainer = document.getElementById('messages-container');
  const historyLoader = document.getElementById('history-loader');
  const typingIndicator = document.getElementById('typing-indicator');
  const typingText = document.getElementById('typing-text');

  // Input Controls
  const messageInput = document.getElementById('message-input');
  const btnSendMessage = document.getElementById('btn-send-message');
  const btnAttach = document.getElementById('btn-attach');
  const attachMenu = document.getElementById('attach-menu');
  const optSendMedia = document.getElementById('opt-send-media');
  const optSendFile = document.getElementById('opt-send-file');
  const fileInputMedia = document.getElementById('file-input-media');
  const fileInputAll = document.getElementById('file-input-all');
  const btnGif = document.getElementById('btn-gif');
  const btnRecordAudio = document.getElementById('btn-record-audio');

  // New Chat Modal Elements
  const newChatModal = document.getElementById('new-chat-modal');
  const btnCloseNewChat = document.getElementById('btn-close-new-chat');
  const newChatSearchInput = document.getElementById('new-chat-search-input');
  const btnSearchUsers = document.getElementById('btn-search-users');
  const newChatResults = document.getElementById('new-chat-results');

  // Call Elements
  const callOverlay = document.getElementById('call-overlay');
  const callTimer = document.getElementById('call-timer');
  const callTypeIndicator = document.getElementById('call-type-indicator');
  const remoteVideo = document.getElementById('remote-video');
  const localVideo = document.getElementById('local-video');
  const remoteAudioAvatar = document.getElementById('remote-audio-avatar');
  const localAudioAvatar = document.getElementById('local-audio-avatar');
  const remoteUserLabel = document.getElementById('remote-user-label');
  const btnCallMute = document.getElementById('btn-call-mute');
  const btnCallVideo = document.getElementById('btn-call-video');
  const btnCallScreen = document.getElementById('btn-call-screen');
  const btnCallHangup = document.getElementById('btn-call-hangup');

  // Incoming Call Modal
  const incomingCallModal = document.getElementById('incoming-call-modal');
  const incomingCallerName = document.getElementById('incoming-caller-name');
  const incomingCallText = document.getElementById('incoming-call-text');
  const btnAcceptCall = document.getElementById('btn-accept-call');
  const btnDeclineCall = document.getElementById('btn-decline-call');
  const ringtoneAudio = document.getElementById('audio-ringtone');

  // GIF & Lightbox Modals
  const gifModal = document.getElementById('gif-modal');
  const gifSearchInput = document.getElementById('gif-search-input');
  const gifGrid = document.getElementById('gif-grid');
  const btnCloseGif = document.getElementById('btn-close-gif');
  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxImg = document.getElementById('lightbox-img');
  const btnCloseLightbox = document.getElementById('btn-close-lightbox');
  const toastEl = document.getElementById('toast');

  // --- PWA Service Worker & Background Push Subscription ---
  let swRegistration = null;

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function registerPWA() {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        swRegistration = await navigator.serviceWorker.register('/sw.js');
        if (token) subscribeUserToPush();
      } catch (err) {
        console.warn('PWA registration:', err);
      }
    }
  }

  async function subscribeUserToPush() {
    if (!swRegistration || !token) return;
    try {
      const res = await fetch('/api/push/vapid-key');
      const { publicKey } = await res.json();
      const applicationServerKey = urlBase64ToUint8Array(publicKey);

      let subscription = await swRegistration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
      }

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ subscription })
      });
    } catch (err) {
      console.warn('Push subscription:', err);
    }
  }

  function clearAppBadge() {
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_BADGE' });
    }
  }

  window.addEventListener('focus', clearAppBadge);
  registerPWA();

  // Toast Helper
  function showToast(msg, duration = 3000) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    setTimeout(() => toastEl.classList.add('hidden'), duration);
  }

  // --- Auth & Startup ---
  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.classList.remove('hidden');
    formRegister.classList.add('hidden');
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formRegister.classList.remove('hidden');
    formLogin.classList.add('hidden');
  });

  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = loginIdentifier.value.trim();
    const password = loginPassword.value;
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      token = data.token;
      currentUser = data.user;
      localStorage.setItem('cipherchat_jwt', token);
      initApp();
    } catch (err) {
      alert(err.message);
    }
  });

  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = regName.value.trim();
    const email = regEmail.value.trim();
    const phone = regPhone.value.trim();
    const password = regPassword.value;

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');

      token = data.token;
      currentUser = data.user;
      localStorage.setItem('cipherchat_jwt', token);
      initApp();
    } catch (err) {
      alert(err.message);
    }
  });

  btnLogout.addEventListener('click', () => {
    if (confirm('Disconnect from NEXUS terminal?')) {
      localStorage.removeItem('cipherchat_jwt');
      window.location.reload();
    }
  });

  // Verify stored session on startup
  async function verifyStoredSession() {
    if (!token) return;
    try {
      const res = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
        initApp();
      } else {
        localStorage.removeItem('cipherchat_jwt');
      }
    } catch (_) {
      localStorage.removeItem('cipherchat_jwt');
    }
  }
  verifyStoredSession();

  function initApp() {
    authModal.classList.remove('active');
    authModal.classList.add('hidden');
    mainLayout.classList.remove('hidden');

    myName.textContent = currentUser.name;

    // Connect Socket.io with Auth
    connectSocket();

    // Subscribe to background push notifications for closed-app alerts
    subscribeUserToPush();
    clearAppBadge();

    // Fetch user's conversation list
    loadConversations();
  }

  // --- Socket.IO & WebRTC Setup ---
  function connectSocket() {
    if (socket) socket.disconnect();

    socket = io({ auth: { token } });
    webrtc = new WebRTCManager(socket);

    setupWebRTCCallbacks();

    socket.on('user_presence', ({ userId, isOnline }) => {
      // Update in conversations list
      const conv = conversations.find((c) => c.peer_id === userId);
      if (conv) conv.isOnline = isOnline;
      renderConversations();

      // Update active chat header if open
      if (activeConversation && activeConversation.peer_id === userId) {
        activeConversation.isOnline = isOnline;
        updateChatHeaderStatus();
      }
    });

    socket.on('new_message', (msg) => {
      handleIncomingTextMessage(msg);
    });

    socket.on('new_media', (mediaMsg) => {
      handleIncomingMediaMessage(mediaMsg);
    });

    socket.on('message_unsent', ({ messageId, conversationId }) => {
      handleMessageUnsent(messageId, conversationId);
    });

    socket.on('message_reaction', ({ messageId, emoji, fromUserId }) => {
      handleMessageReaction(messageId, emoji, fromUserId);
    });

    socket.on('user_typing', ({ fromUserId, conversationId, isTyping }) => {
      if (activeConversation && activeConversation.peer_id === fromUserId) {
        if (isTyping) {
          typingText.textContent = `${activeConversation.peer_name} is typing...`;
          typingIndicator.classList.remove('hidden');
          activePeerStatus.textContent = 'typing...';
          activePeerStatus.classList.add('typing');
        } else {
          typingIndicator.classList.add('hidden');
          updateChatHeaderStatus();
        }
      }
    });

    // Call signaling
    socket.on('incoming_call', ({ callerId, callerName, callType }) => {
      pendingIncomingCall = { callerId, callerName, callType };
      incomingCallerName.textContent = callerName;
      incomingCallText.textContent = `Incoming ${callType === 'video' ? 'Video' : 'Audio'} Call...`;
      incomingCallModal.classList.remove('hidden');
      try {
        ringtoneAudio.currentTime = 0;
        ringtoneAudio.play().catch(() => {});
      } catch (_) {}
    });

    socket.on('call_response', ({ responderId, responderName, accepted }) => {
      if (accepted) {
        showToast(`${responderName} accepted the call.`);
        startCallTimer();
      } else {
        showToast(`${responderName} declined.`);
        endActiveCall(false);
      }
    });

    socket.on('webrtc_signal', async (data) => {
      await webrtc.handleIncomingSignal(data);
    });

    socket.on('call_ended', () => {
      showToast('Call ended');
      endActiveCall(false);
    });
  }

  // --- Conversations Management ---
  async function loadConversations() {
    try {
      const res = await fetch('/api/conversations', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      conversations = data.conversations || [];
      renderConversations();
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }

  function renderConversations() {
    conversationsList.innerHTML = '';
    if (conversations.length === 0) {
      conversationsList.innerHTML = '<p class="hint-text">No conversations yet. Click the message icon above to start chatting!</p>';
      return;
    }

    conversations.forEach((conv) => {
      const item = document.createElement('div');
      item.className = `conv-item ${activeConversation?.id === conv.id ? 'active' : ''}`;
      item.dataset.convId = conv.id;

      const lastText = conv.lastMessage
        ? (conv.lastMessage.is_unsent ? '🚫 Message unsent' : conv.lastMessage.text)
        : 'Started chat';
      const timeStr = conv.lastMessage ? formatChatTime(conv.lastMessage.created_at) : '';

      item.innerHTML = `
        <div class="avatar-wrapper">
          <div class="avatar"><i class="fa-solid fa-user"></i></div>
          <span class="status-indicator ${conv.isOnline ? 'online' : ''}"></span>
        </div>
        <div class="conv-info">
          <div class="conv-top">
            <span class="conv-name">${escapeHtml(conv.peer_name)}</span>
            <span class="conv-time">${timeStr}</span>
          </div>
          <p class="conv-last-msg">${escapeHtml(lastText)}</p>
        </div>
      `;

      item.addEventListener('click', () => openConversation(conv));
      conversationsList.appendChild(item);
    });
  }

  // Open / Switch Active Conversation
  async function openConversation(conv) {
    activeConversation = conv;
    noChatScreen.classList.add('hidden');
    activeChatScreen.classList.remove('hidden');

    clearAppBadge();

    // Mobile slide transition
    sidebar.classList.add('mobile-hidden');
    chatMain.classList.add('mobile-active');

    activePeerName.textContent = conv.peer_name;
    updateChatHeaderStatus();

    // Reset messages viewport
    messagesContainer.innerHTML = '';
    earliestTimestamp = null;
    hasMoreHistory = true;
    closeInChatSearch();

    renderConversations(); // Update active highlight in sidebar

    // Fetch initial page of text messages
    await fetchMessagesPage();
    scrollToBottom();
  }

  btnBackToSidebar.addEventListener('click', () => {
    sidebar.classList.remove('mobile-hidden');
    chatMain.classList.remove('mobile-active');
    activeConversation = null;
    renderConversations();
  });

  function updateChatHeaderStatus() {
    if (!activeConversation) return;
    activePeerStatus.classList.remove('typing');
    if (activeConversation.isOnline) {
      activePeerStatus.textContent = 'Online';
      activePeerStatus.classList.add('online');
      activePeerStatusDot.classList.add('online');
    } else {
      activePeerStatus.textContent = activeConversation.peer_phone || activeConversation.peer_email || 'Offline';
      activePeerStatus.classList.remove('online');
      activePeerStatusDot.classList.remove('online');
    }
  }

  // --- Paginated Text Message Fetching (Scroll to Previous) ---
  async function fetchMessagesPage() {
    if (!activeConversation || isLoadingHistory || !hasMoreHistory) return;
    isLoadingHistory = true;
    historyLoader.classList.remove('hidden');

    const beforeParam = earliestTimestamp ? `&before=${earliestTimestamp}` : '';
    try {
      const res = await fetch(`/api/messages/${activeConversation.id}?limit=30${beforeParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      const msgs = data.messages || [];

      if (msgs.length < 30) {
        hasMoreHistory = false;
      }

      if (msgs.length > 0) {
        earliestTimestamp = msgs[0].created_at;

        // Remember scroll position before prepending
        const oldScrollHeight = messagesViewport.scrollHeight;
        const oldScrollTop = messagesViewport.scrollTop;

        // Prepend messages
        const fragment = document.createDocumentFragment();
        msgs.forEach((msg) => {
          const row = buildTextMessageRow(msg);
          fragment.appendChild(row);
        });

        messagesContainer.prepend(fragment);

        // Adjust scroll to maintain reading position
        if (oldScrollTop > 0 || earliestTimestamp !== msgs[0].created_at) {
          messagesViewport.scrollTop = messagesViewport.scrollHeight - oldScrollHeight + oldScrollTop;
        }
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      isLoadingHistory = false;
      historyLoader.classList.add('hidden');
    }
  }

  // Infinite scroll up listener to load previous messages
  messagesViewport.addEventListener('scroll', () => {
    if (messagesViewport.scrollTop <= 60 && hasMoreHistory && !isLoadingHistory) {
      fetchMessagesPage();
    }
  });

  function scrollToBottom() {
    messagesViewport.scrollTop = messagesViewport.scrollHeight;
  }

  // --- Search Users by Phone Number, Email, or Name ---
  globalSearchInput.addEventListener('input', debounce(async () => {
    const q = globalSearchInput.value.trim();
    if (!q) {
      searchResultsPanel.classList.add('hidden');
      return;
    }

    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      renderSearchResults(data.users || []);
    } catch (_) {}
  }, 250));

  function renderSearchResults(users) {
    searchResultsList.innerHTML = '';
    searchResultsPanel.classList.remove('hidden');

    if (users.length === 0) {
      searchResultsList.innerHTML = '<p class="hint-text">No users found matching that query.</p>';
      return;
    }

    users.forEach((u) => {
      const item = document.createElement('div');
      item.className = 'user-search-item';
      item.innerHTML = `
        <div class="user-search-info">
          <div class="avatar"><i class="fa-solid fa-user"></i></div>
          <div>
            <div class="user-search-name">${escapeHtml(u.name)}</div>
            <div class="user-search-contact">${escapeHtml(u.phone || u.email)}</div>
          </div>
        </div>
        <button class="btn btn-primary" style="padding: 4px 10px; font-size: 12px;">Chat</button>
      `;
      item.addEventListener('click', () => {
        searchResultsPanel.classList.add('hidden');
        globalSearchInput.value = '';
        startChatWithUser(u);
      });
      searchResultsList.appendChild(item);
    });
  }

  // New Chat Modal Handling
  btnOpenNewChat.addEventListener('click', () => {
    newChatModal.classList.remove('hidden');
    newChatSearchInput.focus();
  });

  btnStartChatPrompt.addEventListener('click', () => {
    newChatModal.classList.remove('hidden');
  });

  btnCloseNewChat.addEventListener('click', () => {
    newChatModal.classList.add('hidden');
  });

  btnSearchUsers.addEventListener('click', searchUsersInModal);
  newChatSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchUsersInModal();
  });

  async function searchUsersInModal() {
    const q = newChatSearchInput.value.trim();
    if (!q) return;
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      const users = data.users || [];
      newChatResults.innerHTML = '';

      if (users.length === 0) {
        newChatResults.innerHTML = '<p class="hint-text">No user found with that phone number, email, or name.</p>';
        return;
      }

      users.forEach((u) => {
        const item = document.createElement('div');
        item.className = 'user-search-item';
        item.innerHTML = `
          <div class="user-search-info">
            <div class="avatar"><i class="fa-solid fa-user"></i></div>
            <div>
              <div class="user-search-name">${escapeHtml(u.name)}</div>
              <div class="user-search-contact">${escapeHtml(u.phone)} • ${escapeHtml(u.email)}</div>
            </div>
          </div>
          <button class="btn btn-primary">Start Chat</button>
        `;
        item.addEventListener('click', () => {
          newChatModal.classList.add('hidden');
          startChatWithUser(u);
        });
        newChatResults.appendChild(item);
      });
    } catch (err) {
      alert('Search failed');
    }
  }

  function startChatWithUser(targetUser) {
    const sorted = [Number(currentUser.id), Number(targetUser.id)].sort((a, b) => a - b);
    const convId = `conv_${sorted[0]}_${sorted[1]}`;

    let conv = conversations.find((c) => c.id === convId);
    if (!conv) {
      conv = {
        id: convId,
        peer_id: targetUser.id,
        peer_name: targetUser.name,
        peer_email: targetUser.email,
        peer_phone: targetUser.phone,
        isOnline: false
      };
      conversations.unshift(conv);
    }
    openConversation(conv);
  }

  // --- Message Sending: Text, Unsend, Media ---
  async function sendTextMessage() {
    const text = messageInput.value.trim();
    if (!text || !activeConversation) return;

    messageInput.value = '';
    messageInput.style.height = 'auto';

    socket.emit('typing', {
      recipientId: activeConversation.peer_id,
      conversationId: activeConversation.id,
      isTyping: false
    });

    const now = Date.now();
    const messageId = `msg_${now}_${Math.random().toString(36).substr(2, 6)}`;

    // Emit to socket (server saves to SQLite database)
    socket.emit('send_message', {
      recipientId: activeConversation.peer_id,
      text,
      messageId
    });
  }

  btnSendMessage.addEventListener('click', sendTextMessage);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  });

  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';

    if (activeConversation) {
      socket.emit('typing', {
        recipientId: activeConversation.peer_id,
        conversationId: activeConversation.id,
        isTyping: true
      });

      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        socket.emit('typing', {
          recipientId: activeConversation.peer_id,
          conversationId: activeConversation.id,
          isTyping: false
        });
      }, 1500);
    }
  });

  // Handle incoming text message from socket
  function handleIncomingTextMessage(msg) {
    // Update last message in conversation list
    const conv = conversations.find((c) => c.id === msg.conversationId);
    if (conv) {
      conv.lastMessage = { text: msg.text, is_unsent: msg.isUnsent, created_at: msg.createdAt };
      // Move conversation to top
      conversations = [conv, ...conversations.filter((c) => c.id !== conv.id)];
      renderConversations();
    }

    // If belongs to currently open conversation, append to view
    if (activeConversation && activeConversation.id === msg.conversationId) {
      const row = buildTextMessageRow(msg);
      messagesContainer.appendChild(row);
      scrollToBottom();
    }
  }

  // Build DOM Message Row
  function buildTextMessageRow(msg) {
    const isSent = (msg.sender_id || msg.senderId) === currentUser.id;
    const row = document.createElement('div');
    row.className = `msg-row ${isSent ? 'sent' : 'received'}`;
    row.dataset.msgId = msg.id;

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    const textEl = document.createElement('span');
    textEl.className = `msg-text ${msg.is_unsent || msg.isUnsent ? 'unsent' : ''}`;
    textEl.innerHTML = (msg.is_unsent || msg.isUnsent)
      ? '<i class="fa-solid fa-ban"></i> This message was unsent'
      : escapeHtml(msg.text);
    bubble.appendChild(textEl);

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.innerHTML = `${formatChatTime(msg.created_at || msg.createdAt)} ${isSent ? '<i class="fa-solid fa-check-double"></i>' : ''}`;
    bubble.appendChild(meta);

    // Reactions container
    const reactionsBox = document.createElement('div');
    reactionsBox.className = 'msg-reactions';
    bubble.appendChild(reactionsBox);

    // Action menu button
    const menuBtn = document.createElement('button');
    menuBtn.className = 'msg-menu-btn';
    menuBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';

    const dropdown = document.createElement('div');
    dropdown.className = 'msg-dropdown hidden';

    // Reactions palette inside dropdown
    const reactRow = document.createElement('div');
    reactRow.style.padding = '6px 8px';
    reactRow.style.display = 'flex';
    reactRow.style.gap = '6px';
    ['❤️', '👍', '😂', '😮', '😢', '🔥'].forEach((emoji) => {
      const btn = document.createElement('button');
      btn.textContent = emoji;
      btn.style.background = 'transparent';
      btn.style.border = 'none';
      btn.style.fontSize = '16px';
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.add('hidden');
        sendReaction(msg.id, emoji);
      });
      reactRow.appendChild(btn);
    });
    dropdown.appendChild(reactRow);

    // Unsend option for sent messages
    if (isSent && !(msg.is_unsent || msg.isUnsent)) {
      const btnUnsend = document.createElement('button');
      btnUnsend.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Unsend for everyone';
      btnUnsend.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.add('hidden');
        unsendMessage(msg.id);
      });
      dropdown.appendChild(btnUnsend);
    }

    const btnDeleteLocal = document.createElement('button');
    btnDeleteLocal.innerHTML = '<i class="fa-solid fa-trash"></i> Delete for me';
    btnDeleteLocal.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.add('hidden');
      row.remove();
    });
    dropdown.appendChild(btnDeleteLocal);

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.msg-dropdown').forEach((d) => {
        if (d !== dropdown) d.classList.add('hidden');
      });
      dropdown.classList.toggle('hidden');
    });

    row.appendChild(menuBtn);
    row.appendChild(dropdown);
    row.appendChild(bubble);
    return row;
  }

  // --- Unsend Mechanism ---
  function unsendMessage(messageId) {
    if (!activeConversation) return;
    socket.emit('unsend_message', {
      messageId,
      conversationId: activeConversation.id,
      recipientId: activeConversation.peer_id
    });
  }

  function handleMessageUnsent(messageId, conversationId) {
    const row = document.querySelector(`.msg-row[data-msg-id="${messageId}"]`);
    if (row) {
      const textEl = row.querySelector('.msg-text');
      if (textEl) {
        textEl.className = 'msg-text unsent';
        textEl.innerHTML = '<i class="fa-solid fa-ban"></i> This message was unsent';
      }
    }

    const conv = conversations.find((c) => c.id === conversationId);
    if (conv && conv.lastMessage && conv.lastMessage.id === messageId) {
      conv.lastMessage.is_unsent = 1;
      conv.lastMessage.text = '🚫 This message was unsent';
      renderConversations();
    }
  }

  // Close dropdowns on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.msg-dropdown').forEach((d) => d.classList.add('hidden'));
  });

  // --- Message Reactions ---
  function sendReaction(messageId, emoji) {
    if (!activeConversation) return;
    socket.emit('message_reaction', {
      messageId,
      conversationId: activeConversation.id,
      recipientId: activeConversation.peer_id,
      emoji
    });
    renderReactionBadge(messageId, emoji, true);
  }

  function handleMessageReaction(messageId, emoji) {
    renderReactionBadge(messageId, emoji, false);
  }

  function renderReactionBadge(messageId, emoji) {
    const row = document.querySelector(`.msg-row[data-msg-id="${messageId}"]`);
    if (!row) return;
    const box = row.querySelector('.msg-reactions');
    if (!box) return;

    let pill = box.querySelector(`.reaction-pill[data-emoji="${emoji}"]`);
    if (!pill) {
      pill = document.createElement('span');
      pill.className = 'reaction-pill';
      pill.dataset.emoji = emoji;
      pill.textContent = emoji;
      box.appendChild(pill);
    }
  }

  // Delete Entire Chat
  btnDeleteChat.addEventListener('click', async () => {
    if (!activeConversation) return;
    const ok = confirm(`Delete entire chat with ${activeConversation.peer_name}? All messages will be permanently removed from database.`);
    if (!ok) return;

    try {
      const res = await fetch(`/api/conversations/${activeConversation.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Could not delete chat');

      // Remove from memory
      conversations = conversations.filter((c) => c.id !== activeConversation.id);
      renderConversations();

      // Close active view
      activeConversation = null;
      activeChatScreen.classList.add('hidden');
      noChatScreen.classList.remove('hidden');
      sidebar.classList.remove('mobile-hidden');
      chatMain.classList.remove('mobile-active');
      showToast('Chat deleted.');
    } catch (err) {
      alert(err.message);
    }
  });
  btnToggleSearch.addEventListener('click', () => {
    inChatSearchBar.classList.toggle('hidden');
    if (!inChatSearchBar.classList.contains('hidden')) {
      inChatSearchInput.focus();
    } else {
      clearSearchHighlights();
    }
  });

  btnCloseSearch.addEventListener('click', closeInChatSearch);

  function closeInChatSearch() {
    inChatSearchBar.classList.add('hidden');
    inChatSearchInput.value = '';
    clearSearchHighlights();
  }

  inChatSearchInput.addEventListener('input', debounce(performInChatSearch, 200));

  function performInChatSearch() {
    const query = inChatSearchInput.value.trim().toLowerCase();
    clearSearchHighlights();
    searchMatches = [];
    currentSearchIndex = -1;

    if (!query) {
      searchMatchCount.textContent = '0/0';
      return;
    }

    const textElements = messagesContainer.querySelectorAll('.msg-text:not(.unsent)');
    textElements.forEach((el) => {
      const origText = el.textContent;
      const lower = origText.toLowerCase();
      let index = lower.indexOf(query);

      if (index !== -1) {
        let highlighted = '';
        let lastIdx = 0;
        while (index !== -1) {
          highlighted += escapeHtml(origText.substring(lastIdx, index));
          highlighted += `<mark class="search-highlight">${escapeHtml(origText.substring(index, index + query.length))}</mark>`;
          lastIdx = index + query.length;
          index = lower.indexOf(query, lastIdx);
        }
        highlighted += escapeHtml(origText.substring(lastIdx));
        el.innerHTML = highlighted;
      }
    });

    searchMatches = Array.from(messagesContainer.querySelectorAll('mark.search-highlight'));
    if (searchMatches.length > 0) {
      currentSearchIndex = searchMatches.length - 1; // Start at latest match
      focusSearchMatch(currentSearchIndex);
    } else {
      searchMatchCount.textContent = '0/0';
    }
  }

  function focusSearchMatch(idx) {
    if (searchMatches.length === 0) return;
    searchMatches.forEach((m) => m.classList.remove('current'));

    const target = searchMatches[idx];
    target.classList.add('current');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    searchMatchCount.textContent = `${idx + 1}/${searchMatches.length}`;
  }

  btnSearchNext.addEventListener('click', () => {
    if (searchMatches.length === 0) return;
    currentSearchIndex = (currentSearchIndex + 1) % searchMatches.length;
    focusSearchMatch(currentSearchIndex);
  });

  btnSearchPrev.addEventListener('click', () => {
    if (searchMatches.length === 0) return;
    currentSearchIndex = (currentSearchIndex - 1 + searchMatches.length) % searchMatches.length;
    focusSearchMatch(currentSearchIndex);
  });

  function clearSearchHighlights() {
    messagesContainer.querySelectorAll('.msg-text:not(.unsent)').forEach((el) => {
      el.textContent = el.textContent;
    });
    searchMatchCount.textContent = '0/0';
  }

  // --- Live Media Sharing (Featherweight, ZERO database bloat) ---
  btnAttach.addEventListener('click', () => attachMenu.classList.toggle('hidden'));
  optSendMedia.addEventListener('click', () => {
    attachMenu.classList.add('hidden');
    fileInputMedia.click();
  });
  optSendFile.addEventListener('click', () => {
    attachMenu.classList.add('hidden');
    fileInputAll.click();
  });

  fileInputMedia.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) sendLiveMediaFile(file);
    fileInputMedia.value = '';
  });

  fileInputAll.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) sendLiveMediaFile(file);
    fileInputAll.value = '';
  });

  async function sendLiveMediaFile(file) {
    if (!activeConversation) return;
    const reader = new FileReader();
    reader.onload = () => {
      let type = 'file';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('video/')) type = 'video';
      else if (file.type.startsWith('audio/')) type = 'audio';

      const mediaData = {
        type,
        dataUrl: reader.result,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type
      };

      socket.emit('send_media', {
        recipientId: activeConversation.peer_id,
        mediaData
      });
    };
    reader.readAsDataURL(file);
  }

  // Audio Voice Note Recording
  btnRecordAudio.addEventListener('click', async () => {
    if (!activeConversation) return;
    if (!isRecordingVoice) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.push(e.data);
        };
        mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunks, { type: 'audio/webm' });
          stream.getTracks().forEach((t) => t.stop());
          const reader = new FileReader();
          reader.onload = () => {
            socket.emit('send_media', {
              recipientId: activeConversation.peer_id,
              mediaData: {
                type: 'audio',
                dataUrl: reader.result,
                fileName: `VoiceNote-${Date.now()}.webm`,
                mimeType: 'audio/webm'
              }
            });
          };
          reader.readAsDataURL(blob);
        };
        mediaRecorder.start();
        isRecordingVoice = true;
        btnRecordAudio.classList.add('recording');
        showToast('Recording voice note... Click mic again to send');
      } catch (err) {
        alert('Microphone error: ' + err.message);
      }
    } else {
      mediaRecorder.stop();
      isRecordingVoice = false;
      btnRecordAudio.classList.remove('recording');
    }
  });

  // GIF Picker
  btnGif.addEventListener('click', () => {
    gifModal.classList.remove('hidden');
    loadGifs('trending');
  });

  btnCloseGif.addEventListener('click', () => gifModal.classList.add('hidden'));

  gifSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadGifs(gifSearchInput.value.trim());
  });

  async function loadGifs(query) {
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(query || 'trending')}&limit=12`);
      const data = await res.json();
      gifGrid.innerHTML = '';
      (data.data || []).forEach((item) => {
        const img = document.createElement('img');
        img.src = item.images.fixed_height.url;
        img.className = 'gif-thumb';
        img.addEventListener('click', () => {
          gifModal.classList.add('hidden');
          if (activeConversation) {
            socket.emit('send_media', {
              recipientId: activeConversation.peer_id,
              mediaData: {
                type: 'gif',
                dataUrl: item.images.fixed_height.url,
                fileName: 'GIF'
              }
            });
          }
        });
        gifGrid.appendChild(img);
      });
    } catch (_) {}
  }

  function handleIncomingMediaMessage(mediaMsg) {
    if (activeConversation && activeConversation.id === mediaMsg.conversationId) {
      const isSent = mediaMsg.senderId === currentUser.id;
      const row = document.createElement('div');
      row.className = `msg-row ${isSent ? 'sent' : 'received'}`;

      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble';

      if (mediaMsg.type === 'image' || mediaMsg.type === 'gif') {
        const img = document.createElement('img');
        img.src = mediaMsg.dataUrl;
        img.className = mediaMsg.type === 'image' ? 'chat-image' : 'chat-gif';
        img.addEventListener('click', () => {
          lightboxImg.src = mediaMsg.dataUrl;
          lightboxModal.classList.remove('hidden');
        });
        bubble.appendChild(img);
      } else if (mediaMsg.type === 'video') {
        const vid = document.createElement('video');
        vid.src = mediaMsg.dataUrl;
        vid.className = 'chat-video';
        vid.controls = true;
        bubble.appendChild(vid);
      } else if (mediaMsg.type === 'audio') {
        const aud = document.createElement('audio');
        aud.src = mediaMsg.dataUrl;
        aud.className = 'chat-audio';
        aud.controls = true;
        bubble.appendChild(aud);
      } else if (mediaMsg.type === 'file') {
        const fileLink = document.createElement('a');
        fileLink.href = mediaMsg.dataUrl;
        fileLink.download = mediaMsg.fileName || 'file';
        fileLink.className = 'chat-file-card';
        fileLink.innerHTML = `
          <i class="fa-solid fa-file-arrow-down" style="font-size: 24px; color: #53bdeb;"></i>
          <div>
            <div style="font-weight: 500;">${escapeHtml(mediaMsg.fileName)}</div>
            <div style="font-size: 11px; color: #8696a0;">Click to download</div>
          </div>
        `;
        bubble.appendChild(fileLink);
      }

      const meta = document.createElement('div');
      meta.className = 'msg-meta';
      meta.innerHTML = `${formatChatTime(mediaMsg.createdAt)} ${isSent ? '<i class="fa-solid fa-check-double"></i>' : ''}`;
      bubble.appendChild(meta);

      row.appendChild(bubble);
      messagesContainer.appendChild(row);
      scrollToBottom();
    }
  }

  // --- WebRTC Audio & Video Calling ---
  btnStartAudioCall.addEventListener('click', () => startOutgoingCall('audio'));
  btnStartVideoCall.addEventListener('click', () => startOutgoingCall('video'));

  async function startOutgoingCall(callType) {
    if (!activeConversation) return;
    if (!activeConversation.isOnline) {
      alert('Contact is offline right now.');
      return;
    }

    activeCall = { callType, targetUserId: activeConversation.peer_id };
    setupCallUI(callType, activeConversation.peer_name);
    showToast(`Calling ${activeConversation.peer_name}...`);

    socket.emit('call_request', {
      targetUserId: activeConversation.peer_id,
      callType
    });

    try {
      await webrtc.startCall(activeConversation.peer_id, callType);
    } catch (err) {
      alert('Media devices access failed: ' + err.message);
      endActiveCall();
    }
  }

  btnAcceptCall.addEventListener('click', async () => {
    if (!pendingIncomingCall) return;
    ringtoneAudio.pause();
    incomingCallModal.classList.add('hidden');

    const { callerId, callerName, callType } = pendingIncomingCall;
    activeCall = { callType, targetUserId: callerId };

    setupCallUI(callType, callerName);
    socket.emit('call_response', { callerId, accepted: true });

    try {
      await webrtc.initLocalStream(callType);
      webrtc.createPeerConnection();
      webrtc.localStream.getTracks().forEach((t) => webrtc.peerConnection.addTrack(t, webrtc.localStream));
      startCallTimer();
    } catch (err) {
      alert('Could not open camera/mic: ' + err.message);
      endActiveCall();
    }
  });

  btnDeclineCall.addEventListener('click', () => {
    if (!pendingIncomingCall) return;
    ringtoneAudio.pause();
    incomingCallModal.classList.add('hidden');
    socket.emit('call_response', { callerId: pendingIncomingCall.callerId, accepted: false });
    pendingIncomingCall = null;
  });

  function setupCallUI(callType, name) {
    callOverlay.classList.remove('hidden');
    remoteUserLabel.textContent = name;
    callTypeIndicator.innerHTML = callType === 'video'
      ? '<i class="fa-solid fa-video"></i> Video Call'
      : '<i class="fa-solid fa-phone"></i> Audio Call';

    if (callType === 'audio') {
      remoteVideo.classList.add('hidden');
      remoteAudioAvatar.classList.remove('hidden');
      localVideo.classList.add('hidden');
      localAudioAvatar.classList.remove('hidden');
      btnCallVideo.classList.add('off');
    } else {
      remoteVideo.classList.remove('hidden');
      remoteAudioAvatar.classList.add('hidden');
      localVideo.classList.remove('hidden');
      localAudioAvatar.classList.add('hidden');
      btnCallVideo.classList.remove('off');
    }
  }

  function startCallTimer() {
    callSeconds = 0;
    clearInterval(callTimerInterval);
    callTimerInterval = setInterval(() => {
      callSeconds++;
      const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
      const secs = String(callSeconds % 60).padStart(2, '0');
      callTimer.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  function endActiveCall(notifyPeer = true) {
    clearInterval(callTimerInterval);
    callOverlay.classList.add('hidden');
    remoteVideo.srcObject = null;
    localVideo.srcObject = null;
    if (webrtc) webrtc.endCall(notifyPeer);
    activeCall = null;
    ringtoneAudio.pause();
  }

  btnCallHangup.addEventListener('click', () => endActiveCall(true));

  btnCallMute.addEventListener('click', () => {
    const isEnabled = webrtc.toggleAudio();
    btnCallMute.classList.toggle('off', !isEnabled);
    btnCallMute.innerHTML = isEnabled ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
  });

  btnCallVideo.addEventListener('click', () => {
    const isEnabled = webrtc.toggleVideo();
    btnCallVideo.classList.toggle('off', !isEnabled);
    btnCallVideo.innerHTML = isEnabled ? '<i class="fa-solid fa-video"></i>' : '<i class="fa-solid fa-video-slash"></i>';
    localVideo.classList.toggle('hidden', !isEnabled);
    localAudioAvatar.classList.toggle('hidden', isEnabled);
  });

  btnCallScreen.addEventListener('click', async () => {
    await webrtc.toggleScreenShare();
  });

  function setupWebRTCCallbacks() {
    webrtc.onLocalStreamCallback = (stream, callType) => {
      localVideo.srcObject = stream;
    };
    webrtc.onRemoteStreamCallback = (stream, callType) => {
      remoteVideo.srcObject = stream;
    };
    webrtc.onCallEndCallback = () => {
      endActiveCall(false);
    };
  }

  // Lightbox Close
  btnCloseLightbox.addEventListener('click', () => lightboxModal.classList.add('hidden'));

  // Utility helpers
  function formatChatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(Number(timestamp));
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
  }

  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }
})();

// ChatPanel — Renderer-side chat controller
// Communicates via fetch() to http://localhost:7890 and window.sparkBridge.onServerEvent()

window.ChatPanel = (function () {
  const API_BASE = 'http://localhost:7890';

  const state = {
    currentSession: null,
    sessions: [],
    messages: [],
    isTyping: false,
    typingTimeout: null,
    streamingMessage: null,
    isOpen: false
  };

  // DOM refs (populated in init)
  let dom = {};

  function init() {
    dom = {
      panel: document.getElementById('chatPanel'),
      agentName: document.getElementById('chatAgentName'),
      sessionTitle: document.getElementById('chatSessionTitle'),
      messagesContainer: document.getElementById('chatMessages'),
      sessionsList: document.getElementById('chatSessionsList'),
      typingIndicator: document.getElementById('chatTypingIndicator'),
      input: document.getElementById('chatInput'),
      agentSelect: document.getElementById('chatAgentSelect'),
      btnSend: document.getElementById('btnChatSend'),
      btnNew: document.getElementById('btnChatNew'),
      btnSessions: document.getElementById('btnChatSessions'),
      btnCollapse: document.getElementById('btnChatCollapse')
    };

    if (!dom.panel) {
      console.error('ChatPanel: DOM elements not found');
      return;
    }

    // Wire events
    dom.btnSend.addEventListener('click', sendMessage);
    dom.btnNew.addEventListener('click', newSession);
    dom.btnSessions.addEventListener('click', toggleSessionsList);
    dom.btnCollapse.addEventListener('click', () => toggle(false));

    dom.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
      }
    });

    // Listen for server events
    if (window.sparkBridge) {
      window.sparkBridge.onServerEvent((eventData) => {
        if (eventData.type === 'chat_message') {
          handleIncomingMessage(eventData.data || eventData);
        } else if (eventData.type === 'chat_stream') {
          handleStreamChunk(eventData.data || eventData);
        } else if (eventData.type === 'chat_typing') {
          handleTyping(eventData.data || eventData);
        }
      });
    }

    // Load existing sessions
    loadSessions();
  }

  function toggle(forceState) {
    if (forceState !== undefined) {
      state.isOpen = forceState;
    } else {
      state.isOpen = !state.isOpen;
    }

    if (state.isOpen) {
      dom.panel.classList.remove('hidden');
      // Auto-create session if none exists
      if (!state.currentSession) {
        newSession();
      } else {
        loadSessions();
      }
      setTimeout(() => dom.input && dom.input.focus(), 100);
    } else {
      dom.panel.classList.add('hidden');
    }
  }

  async function newSession() {
    const agent = dom.agentSelect ? dom.agentSelect.value : 'spark';
    try {
      const res = await fetch(`${API_BASE}/api/chat/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent, title: 'New Conversation' })
      });
      const data = await res.json();
      if (data.ok && data.session) {
        state.currentSession = data.session;
        state.messages = [];
        if (dom.sessionTitle) dom.sessionTitle.textContent = data.session.title || 'New Conversation';
        if (dom.agentName) dom.agentName.textContent = capitalize(data.session.agent);
        renderMessages();
        loadSessions();
        if (dom.sessionsList) dom.sessionsList.classList.add('hidden');
        if (dom.input) dom.input.focus();
      }
    } catch (e) {
      console.error('ChatPanel: Failed to create session:', e);
    }
  }

  async function loadSessions() {
    try {
      const res = await fetch(`${API_BASE}/api/chat/sessions`);
      const data = await res.json();
      if (data.ok && data.sessions) {
        state.sessions = data.sessions;
        renderSessionsList();
      }
    } catch (e) {
      console.error('ChatPanel: Failed to load sessions:', e);
    }
  }

  function renderSessionsList() {
    if (!dom.sessionsList) return;
    dom.sessionsList.innerHTML = '';
    state.sessions.forEach((sess) => {
      const item = document.createElement('div');
      item.className = 'chat-session-item';
      if (state.currentSession && sess.id === state.currentSession.id) {
        item.classList.add('active');
      }
      const name = document.createElement('span');
      name.className = 'session-name';
      name.textContent = `${capitalize(sess.agent)}: ${sess.title || 'Conversation'}`;
      const delBtn = document.createElement('button');
      delBtn.className = 'session-delete';
      delBtn.textContent = '🗑';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSession(sess.id);
      });
      item.appendChild(name);
      item.appendChild(delBtn);
      item.addEventListener('click', () => switchSession(sess));
      dom.sessionsList.appendChild(item);
    });
  }

  function toggleSessionsList() {
    if (!dom.sessionsList) return;
    if (dom.sessionsList.classList.contains('hidden')) {
      dom.sessionsList.classList.remove('hidden');
      loadSessions();
    } else {
      dom.sessionsList.classList.add('hidden');
    }
  }

  async function switchSession(session) {
    state.currentSession = session;
    if (dom.sessionTitle) dom.sessionTitle.textContent = session.title || 'Conversation';
    if (dom.agentName) dom.agentName.textContent = capitalize(session.agent);
    dom.sessionsList.classList.add('hidden');
    // Load messages
    try {
      const res = await fetch(`${API_BASE}/api/chat/messages?session=${session.id}&limit=100`);
      const data = await res.json();
      if (data.ok && data.messages) {
        state.messages = data.messages;
        renderMessages();
      }
    } catch (e) {
      console.error('ChatPanel: Failed to load messages:', e);
    }
  }

  async function deleteSession(sessionId) {
    try {
      await fetch(`${API_BASE}/api/chat/delete-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
      if (state.currentSession && state.currentSession.id === sessionId) {
        state.currentSession = null;
        state.messages = [];
        renderMessages();
        newSession();
      }
      loadSessions();
    } catch (e) {
      console.error('ChatPanel: Failed to delete session:', e);
    }
  }

  async function sendMessage() {
    if (!dom.input) return;
    const text = dom.input.value.trim();
    if (!text) return;

    if (!state.currentSession) {
      await newSession();
      if (!state.currentSession) return;
    }

    const agent = dom.agentSelect ? dom.agentSelect.value : 'spark';
    const sessionId = state.currentSession.id;

    // Optimistic display
    displayMessage({
      role: 'user',
      content: text,
      agent: agent,
      timestamp: Date.now()
    });

    dom.input.value = '';

    // POST to chat/send (persists + broadcasts + triggers HermesAdapter)
    try {
      await fetch(`${API_BASE}/api/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          role: 'user',
          content: text,
          agent: agent
        })
      });
    } catch (e) {
      console.error('ChatPanel: Failed to send message:', e);
    }

    // Also POST to /api/prompt for backward compat with MCP-polling agents
    try {
      await fetch(`${API_BASE}/api/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetAgent: agent,
          prompt: text
        })
      });
    } catch (e) {
      // Silent fail — backward compat only
    }
  }

  function handleIncomingMessage(data) {
    // Don't double-render our own messages
    if (data.role === 'user') {
      // Check if we already displayed this (optimistic render)
      const existing = state.messages.find(m =>
        m.role === 'user' &&
        m.content === data.content &&
        Math.abs((m.timestamp || 0) - (data.timestamp || 0)) < 5000
      );
      if (existing) return;
    }

    displayMessage(data);
    state.messages.push(data);
  }

  function handleStreamChunk(data) {
    const streamId = data.stream_id;
    const chunk = data.chunk || '';
    const done = data.done;
    const agent = data.agent || 'agent';
    const fullContent = data.full_content || '';

    if (done) {
      // Finalize streaming message
      if (state.streamingMessage) {
        // Update content with full_content if provided
        if (fullContent) {
          const bubble = state.streamingMessage.element.querySelector('.bubble');
          if (bubble) {
            bubble.innerHTML = formatContent(fullContent);
          }
        }
        state.streamingMessage = null;
      }
      // Add to messages array
      if (fullContent) {
        state.messages.push({
          role: 'agent',
          content: fullContent,
          agent: agent,
          timestamp: Date.now()
        });
      }
      return;
    }

    // First chunk for this stream_id — create element
    if (!state.streamingMessage || state.streamingMessage.streamId !== streamId) {
      const msgEl = createMessageElement('agent', '', agent);
      dom.messagesContainer.appendChild(msgEl);
      state.streamingMessage = {
        streamId: streamId,
        element: msgEl,
        fullContent: chunk
      };
    } else {
      // Append chunk
      state.streamingMessage.fullContent += chunk;
    }

    // Re-render
    const bubble = state.streamingMessage.element.querySelector('.bubble');
    if (bubble) {
      bubble.innerHTML = formatContent(state.streamingMessage.fullContent);
    }

    scrollToBottom();
  }

  function handleTyping(data) {
    const isTyping = data.is_typing;
    if (isTyping) {
      if (dom.typingIndicator) {
        dom.typingIndicator.classList.remove('hidden');
      }
      // Auto-hide after 30s
      if (state.typingTimeout) clearTimeout(state.typingTimeout);
      state.typingTimeout = setTimeout(() => {
        if (dom.typingIndicator) dom.typingIndicator.classList.add('hidden');
      }, 30000);
    } else {
      if (dom.typingIndicator) {
        dom.typingIndicator.classList.add('hidden');
      }
      if (state.typingTimeout) {
        clearTimeout(state.typingTimeout);
        state.typingTimeout = null;
      }
    }
  }

  function displayMessage(msg) {
    const el = createMessageElement(msg.role, msg.content, msg.agent || msg.author);
    dom.messagesContainer.appendChild(el);
    state.messages.push(msg);
    scrollToBottom();
  }

  function createMessageElement(role, content, agent) {
    const wrapper = document.createElement('div');
    wrapper.className = `chat-message ${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = formatContent(content || '');

    wrapper.appendChild(bubble);

    if (agent && role !== 'system') {
      const meta = document.createElement('div');
      meta.className = 'msg-meta';
      meta.textContent = capitalize(agent);
      if (role === 'user') meta.style.textAlign = 'right';
      wrapper.appendChild(meta);
    }

    return wrapper;
  }

  function renderMessages() {
    if (!dom.messagesContainer) return;
    dom.messagesContainer.innerHTML = '';
    state.messages.forEach((msg) => {
      const el = createMessageElement(msg.role, msg.content, msg.agent);
      dom.messagesContainer.appendChild(el);
    });
    scrollToBottom();
  }

  function scrollToBottom() {
    if (dom.messagesContainer) {
      dom.messagesContainer.scrollTop = dom.messagesContainer.scrollHeight;
    }
  }

  function formatContent(text) {
    if (!text) return '';
    let html = escapeHtml(text);

    // Code blocks: ```lang\ncode```
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline code: `code`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold: **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic: *text*
    html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  return {
    init,
    toggle,
    newSession,
    loadSessions,
    switchSession,
    deleteSession,
    sendMessage,
    handleIncomingMessage,
    handleStreamChunk,
    handleTyping,
    displayMessage,
    formatContent
  };
})();
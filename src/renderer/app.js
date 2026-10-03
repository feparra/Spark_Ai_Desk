// ⚡ Spark, Astro & Dr. Octopus UI Controller (Ultra-low CPU & GPU Native)

const SKINS = {
  capy: {
    name: 'Capy',
    assets: {
      calm: '../../assets/capy/calm.gif',
      working: '../../assets/capy/working.gif',
      waiting: '../../assets/capy/waiting.gif',
      connecting: '../../assets/capy/waiting.gif',
      done: '../../assets/capy/done.gif',
      error: '../../assets/capy/error.gif'
    }
  },
  llama: {
    name: 'Llama',
    assets: {
      calm: '../../assets/llama/calm.gif',
      working: '../../assets/llama/working.gif',
      waiting: '../../assets/llama/waiting.gif',
      connecting: '../../assets/llama/waiting.gif',
      done: '../../assets/llama/done.gif',
      error: '../../assets/llama/error.gif'
    }
  },
  kitty: {
    name: 'Kitty',
    assets: {
      calm: '../../assets/kitty/calm.gif',
      working: '../../assets/kitty/working.gif',
      waiting: '../../assets/kitty/waiting.gif',
      connecting: '../../assets/kitty/waiting.gif',
      done: '../../assets/kitty/done.gif',
      error: '../../assets/kitty/error.gif'
    }
  },
  piper: {
    name: 'Piper',
    assets: {
      calm: '../../assets/piper/calm.gif',
      working: '../../assets/piper/working.gif',
      waiting: '../../assets/piper/waiting.gif',
      connecting: '../../assets/piper/waiting.gif',
      done: '../../assets/piper/done.gif',
      error: '../../assets/piper/error.gif'
    }
  },
  dr_octopus: {
    name: 'Dr. Octopus',
    assets: {
      calm: '../../assets/dr_octopus/calm.gif',
      working: '../../assets/dr_octopus/working.gif',
      waiting: '../../assets/dr_octopus/waiting.gif',
      connecting: '../../assets/dr_octopus/waiting.gif',
      done: '../../assets/dr_octopus/done.gif',
      error: '../../assets/dr_octopus/error.gif'
    }
  },
  astro: {
    name: 'Astro 8-Bit',
    assets: {
      calm: '../../assets/astro/calm.gif',
      working: '../../assets/astro/working.gif',
      waiting: '../../assets/astro/waiting.gif',
      connecting: '../../assets/astro/waiting.gif',
      done: '../../assets/astro/done.gif',
      error: '../../assets/astro/error.gif'
    }
  },
  spark: {
    name: 'Classic Spark',
    assets: {
      calm: '../../assets/gifs/spark_calm.gif',
      working: '../../assets/gifs/spark_working.gif',
      waiting: '../../assets/gifs/spark_connecting.gif',
      connecting: '../../assets/gifs/spark_connecting.gif',
      done: '../../assets/gifs/spark_done.gif',
      error: '../../assets/gifs/spark_error.gif'
    }
  }
};

let currentSkin = 'capy';
let currentCharacterState = 'calm';
let currentAssetLoaded = '';

const AGENT_COLORS = {
  capy: { bg: 'rgba(217, 119, 6, 0.15)', text: '#d97706', border: 'rgba(217, 119, 6, 0.3)' },
  llama: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
  kitty: { bg: 'rgba(234, 88, 12, 0.15)', text: '#ea580c', border: 'rgba(234, 88, 12, 0.3)' },
  piper: { bg: 'rgba(236, 72, 153, 0.15)', text: '#ec4899', border: 'rgba(236, 72, 153, 0.3)' },
  spark: { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)' },
  astro: { bg: 'rgba(249, 115, 22, 0.15)', text: '#fb923c', border: 'rgba(249, 115, 22, 0.3)' },
  dr_octopus: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
  claude: { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316', border: 'rgba(249, 115, 22, 0.3)' },
  antigravity: { bg: 'rgba(129, 140, 248, 0.15)', text: '#818cf8', border: 'rgba(129, 140, 248, 0.3)' },
  hermes: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
  openclaw: { bg: 'rgba(6, 182, 212, 0.15)', text: '#06b6d4', border: 'rgba(6, 182, 212, 0.3)' },
  codex: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' }
};

// DOM Elements
const sparkImg = document.getElementById('sparkImg');
const speechBubbleContainer = document.getElementById('speechBubbleContainer');
const agentBadge = document.getElementById('agentBadge');
const agentNameText = document.getElementById('agentNameText');
const btnCloseBubble = document.getElementById('btnCloseBubble');
const bubbleTitle = document.getElementById('bubbleTitle');
const bubbleMessage = document.getElementById('bubbleMessage');
const bubbleCode = document.getElementById('bubbleCode');
const bubbleActions = document.getElementById('bubbleActions');
const statusPillText = document.getElementById('statusPillText');
const statusPillDot = document.getElementById('statusPillDot');
const avatarSection = document.getElementById('avatarSection');

let currentNotificationId = null;
let bubbleTimer = null;

// =========================================================
// 🔄 STATE & CHARACTER UPDATE (Direct GPU Rendering)
// =========================================================
function updateState(stateData) {
  const { state = 'calm', agent = currentSkin, message = '', skin } = stateData;
  currentCharacterState = state;

  if (skin && SKINS[skin]) {
    currentSkin = skin;
  }

  // 1. Direct GPU rendering without CPU canvas overhead
  const activeSkin = SKINS[currentSkin] || SKINS.dr_octopus;
  const assetUrl = activeSkin.assets[state] || activeSkin.assets.calm;

  if (currentAssetLoaded !== assetUrl) {
    currentAssetLoaded = assetUrl;
    sparkImg.src = assetUrl;
  }

  // 2. Agent Theme
  applyAgentTheme(agent);

  // 3. Status Pill
  if (message) {
    statusPillText.textContent = message;
  } else {
    statusPillText.textContent = getStatusDefaultText(state, agent);
  }

  // 4. Dot Status Color
  if (state === 'error') {
    statusPillDot.style.background = '#ef4444';
    statusPillDot.style.boxShadow = '0 0 8px #ef4444';
  } else if (state === 'working') {
    statusPillDot.style.background = '#3b82f6';
    statusPillDot.style.boxShadow = '0 0 8px #3b82f6';
  } else if (state === 'done') {
    statusPillDot.style.background = '#10b981';
    statusPillDot.style.boxShadow = '0 0 8px #10b981';
  } else if (state === 'waiting') {
    statusPillDot.style.background = '#f59e0b';
    statusPillDot.style.boxShadow = '0 0 8px #f59e0b';
  } else {
    statusPillDot.style.background = '#10b981';
    statusPillDot.style.boxShadow = '0 0 8px #10b981';
  }
}

function getStatusDefaultText(state, agent) {
  const name = capitalize(agent || (SKINS[currentSkin] ? SKINS[currentSkin].name : 'Companion'));
  switch (state) {
    case 'working': return `${name} is coding...`;
    case 'waiting': return `${name} needs confirmation`;
    case 'done': return `Task completed ✨`;
    case 'error': return `Execution error ❌`;
    case 'connecting': return `Connecting to ${name}...`;
    default: return `${name} is resting`;
  }
}

function applyAgentTheme(agentName) {
  const key = (agentName || currentSkin).toLowerCase();
  const theme = AGENT_COLORS[key] || AGENT_COLORS.dr_octopus;

  agentBadge.style.backgroundColor = theme.bg;
  agentBadge.style.color = theme.text;
  agentBadge.style.borderColor = theme.border;
  agentNameText.textContent = capitalize(agentName || (SKINS[currentSkin] ? SKINS[currentSkin].name : 'Companion'));
}

// =========================================================
// 💬 NOTIFICATIONS & SPEECH BUBBLE
// =========================================================

// 📬 showMessageToast — Mensaje informativo sin botones, auto-dismiss 8s
function showMessageToast(data) {
  const {
    id = `msg_${Date.now()}`,
    agent = 'hermes',
    title = '',
    message = '',
    timeout = 8,
    sound = true
  } = data;

  if (bubbleTimer) clearTimeout(bubbleTimer);

  // Sonido suave para mensajes informativos
  if (sound && window.sparkAudio) {
    window.sparkAudio.popNotification();
  }

  // Actualizar tema del agente
  applyAgentTheme(agent);

  // Contenido del toast
  bubbleTitle.textContent = title || capitalize(agent);
  bubbleMessage.textContent = message;

  // Sin bloque de código
  bubbleCode.style.display = 'none';

  // Sin botones de acción
  bubbleActions.innerHTML = '';

  // Mostrar toast
  speechBubbleContainer.classList.remove('hidden');

  // Auto-dismiss después de `timeout` segundos (8s por defecto)
  if (timeout > 0) {
    bubbleTimer = setTimeout(() => {
      hideBubble();
    }, timeout * 1000);
  }
}

function showNotification(notif) {
  const {
    id,
    agent = currentSkin,
    state = 'waiting',
    title = 'Attention',
    message = '',
    code = '',
    actions = ['Approve', 'Reject'],
    timeout = 0,
    sound = true
  } = notif;

  currentNotificationId = id;
  if (bubbleTimer) clearTimeout(bubbleTimer);

  // Play procedural Web Audio API sound
  if (sound && window.sparkAudio) {
    if (state === 'waiting') {
      window.sparkAudio.knockKnock();
    } else if (state === 'done') {
      window.sparkAudio.chimeSuccess();
    } else if (state === 'error') {
      window.sparkAudio.alertError();
    } else {
      window.sparkAudio.popNotification();
    }
  }

  // Update bubble content
  applyAgentTheme(agent);
  bubbleTitle.textContent = title;
  bubbleMessage.textContent = message;

  if (code) {
    bubbleCode.textContent = code;
    bubbleCode.style.display = 'block';
  } else {
    bubbleCode.style.display = 'none';
  }

  // Generate action buttons
  bubbleActions.innerHTML = '';
  if (Array.isArray(actions) && actions.length > 0) {
    actions.forEach((actText, idx) => {
      const btn = document.createElement('button');
      btn.className = `btn-action ${idx === 0 ? 'btn-primary' : 'btn-secondary'}`;
      btn.textContent = actText;
      btn.onclick = () => handleActionClick(id, actText);
      bubbleActions.appendChild(btn);
    });
  }

  // Show bubble
  speechBubbleContainer.classList.remove('hidden');

  // Auto-dismiss timer if specified
  if (timeout > 0) {
    bubbleTimer = setTimeout(() => {
      hideBubble();
    }, timeout * 1000);
  }
}

function handleActionClick(id, action) {
  if (window.sparkAudio) window.sparkAudio.buttonClick();

  if (window.sparkBridge) {
    window.sparkBridge.sendAction(id, action);
  }

  hideBubble();
}

function hideBubble() {
  speechBubbleContainer.classList.add('hidden');
  currentNotificationId = null;
}

// Close button
btnCloseBubble.addEventListener('click', () => {
  if (window.sparkAudio) window.sparkAudio.buttonClick();
  hideBubble();
});

// =========================================================
// ⌨️ QUICK-INPUT COMMAND HUB (Multi-Agent Dispatcher)
// =========================================================
const quickInputCommandHub = document.getElementById('quickInputCommandHub');
const agentPillsList = document.getElementById('agentPillsList');
const btnCloseQuickInput = document.getElementById('btnCloseQuickInput');
const quickPromptInput = document.getElementById('quickPromptInput');
const btnSendPrompt = document.getElementById('btnSendPrompt');

let selectedTargetAgent = 'all';
const AGENT_KEYS = ['all', 'claude', 'antigravity', 'openclaw'];

function openQuickInput(target = 'all') {
  hideBubble();
  quickInputCommandHub.classList.remove('hidden');
  selectAgentPill(target);
  quickPromptInput.value = '';
  quickPromptInput.focus();
  if (window.sparkAudio) window.sparkAudio.popNotification();
}

function closeQuickInput() {
  quickInputCommandHub.classList.add('hidden');
  quickPromptInput.value = '';
}

function selectAgentPill(agentName) {
  selectedTargetAgent = agentName.toLowerCase();
  const pills = agentPillsList.querySelectorAll('.agent-pill');
  pills.forEach(p => {
    if (p.dataset.agent === selectedTargetAgent) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });

  const displayTarget = selectedTargetAgent === 'all' ? 'All Agents' : capitalize(selectedTargetAgent);
  quickPromptInput.placeholder = `Command ${displayTarget} (Tab to switch)...`;
}

function submitQuickPrompt() {
  const text = quickPromptInput.value.trim();
  if (!text) return;

  // Auto-detect @mentions
  let finalTarget = selectedTargetAgent;
  let cleanText = text;

  if (text.startsWith('@claude')) {
    finalTarget = 'claude';
    cleanText = text.replace(/^@claude\s*/i, '');
  } else if (text.startsWith('@antigravity') || text.startsWith('@gemini')) {
    finalTarget = 'antigravity';
    cleanText = text.replace(/^@(antigravity|gemini)\s*/i, '');
  } else if (text.startsWith('@openclaw') || text.startsWith('@hermes')) {
    finalTarget = 'openclaw';
    cleanText = text.replace(/^@(openclaw|hermes)\s*/i, '');
  } else if (text.startsWith('@all')) {
    finalTarget = 'all';
    cleanText = text.replace(/^@all\s*/i, '');
  }

  if (window.sparkAudio) window.sparkAudio.buttonClick();

  // Send via bridge or direct HTTP
  if (window.sparkBridge) {
    window.sparkBridge.sendPrompt(finalTarget, cleanText);
  } else {
    fetch('http://localhost:7890/api/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetAgent: finalTarget, prompt: cleanText })
    }).catch(e => console.error(e));
  }

  // Visual feedback
  statusPillText.textContent = `🚀 Dispatched to ${finalTarget.toUpperCase()}`;
  closeQuickInput();
}

// Agent Pill Clicks
agentPillsList.addEventListener('click', (e) => {
  const pill = e.target.closest('.agent-pill');
  if (pill && pill.dataset.agent) {
    if (window.sparkAudio) window.sparkAudio.buttonClick();
    selectAgentPill(pill.dataset.agent);
    quickPromptInput.focus();
  }
});

// Close button
btnCloseQuickInput.addEventListener('click', () => {
  if (window.sparkAudio) window.sparkAudio.buttonClick();
  closeQuickInput();
});

// Send button
btnSendPrompt.addEventListener('click', () => {
  submitQuickPrompt();
});

// Keyboard controls
quickPromptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitQuickPrompt();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeQuickInput();
  } else if (e.key === 'Tab') {
    e.preventDefault();
    if (window.sparkAudio) window.sparkAudio.buttonClick();
    const currentIdx = AGENT_KEYS.indexOf(selectedTargetAgent);
    const nextIdx = (currentIdx + 1) % AGENT_KEYS.length;
    selectAgentPill(AGENT_KEYS[nextIdx]);
  }
});

// Global Esc to close any open prompt/bubble
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!quickInputCommandHub.classList.contains('hidden')) {
      closeQuickInput();
    } else if (!speechBubbleContainer.classList.contains('hidden')) {
      hideBubble();
    }
  }
});

// Double click on avatar cycles through all available character skins
avatarSection.addEventListener('dblclick', (e) => {
  e.stopPropagation();
  const skinKeys = Object.keys(SKINS);
  const nextIdx = (skinKeys.indexOf(currentSkin) + 1) % skinKeys.length;
  currentSkin = skinKeys[nextIdx];
  if (window.sparkAudio) window.sparkAudio.popNotification();
  updateState({ state: currentCharacterState, agent: currentSkin, message: `Switched to ${SKINS[currentSkin].name}` });
});

// Right click on avatar opens context menu with options
avatarSection.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (window.sparkBridge) {
    window.sparkBridge.showContextMenu();
  }
});

// Single click on avatar — DISABLED (Quick-Input Hub desactivado)
// Antes abría el Quick-Input. Ahora no hace nada para evitar escritura.
// Para reactivar, descomentar el bloque de abajo
/*
avatarSection.addEventListener('click', (e) => {
  if (quickInputCommandHub.classList.contains('hidden')) {
    openQuickInput();
  } else {
    closeQuickInput();
  }
});
*/

// =========================================================
// 🔌 LISTEN TO ELECTRON IPC / BACKEND EVENTS
// =========================================================
if (window.sparkBridge) {
  window.sparkBridge.onServerEvent((eventData) => {
    if (eventData.type === 'state_changed' || eventData.type === 'init') {
      updateState(eventData.data);
    } else if (eventData.type === 'message') {
      // 📬 Mensaje informativo — muestra toast sin botones con auto-dismiss
      const data = eventData.data;
      updateState({ state: data.state || 'calm', agent: data.agent, message: data.title || data.message });
      showMessageToast(data);
    } else if (eventData.type === 'notification') {
      updateState(eventData.data);
      showNotification(eventData.data);
    } else if (eventData.type === 'toggle_quick_input') {
      // DISABLED: Quick-Input Hub desactivado por el usuario
      // Para reactivar, descomentar el bloque de abajo
      /*
      if (quickInputCommandHub.classList.contains('hidden')) {
        openQuickInput();
      } else {
        closeQuickInput();
      }
      */
    } else if (eventData.type === 'agent_prompt_dispatched') {
      if (window.sparkAudio) window.sparkAudio.popNotification();
      statusPillText.textContent = `⚡ Sent to ${eventData.data.targetAgent.toUpperCase()}: "${eventData.data.prompt.slice(0, 20)}..."`;
    } else if (eventData.type === 'dismiss') {
      hideBubble();
      closeQuickInput();
    } else if (eventData.type === 'set_skin') {
      updateState({ state: currentCharacterState, skin: eventData.skin });
    } else if (eventData.type === 'agents_radar_update') {
      if (currentCharacterState === 'calm' && quickInputCommandHub.classList.contains('hidden')) {
        statusPillText.textContent = eventData.pillMessage;
      }
    } else if (eventData.type === 'facing_changed') {
      const avatarContainer = document.getElementById('sparkAvatarContainer');
      if (avatarContainer) {
        if (eventData.direction === 'left') {
          avatarContainer.classList.add('facing-left');
        } else {
          avatarContainer.classList.remove('facing-left');
        }
      }
    }
  });
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Initial initialization with Capy
updateState({ state: 'calm', agent: 'capy', skin: 'capy', message: 'Capy Ready' });

// Startup welcome bubble
setTimeout(() => {
  showNotification({
    id: 'startup_welcome',
    agent: 'capy',
    state: 'calm',
    title: 'Command Hub Active! ⚡🦫',
    message: "Click me or press Alt+Space to open the Multi-Agent Command Bar!\n\n💡 Tip: Double-click me to switch between Capy, Dr. Octopus, Kitty, Piper, Llama, and Astro.",
    actions: ['Got it!'],
    timeout: 10,
    sound: true
  });
}, 800);


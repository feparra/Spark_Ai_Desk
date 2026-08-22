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

// Double click on avatar cycles through all available character skins
avatarSection.addEventListener('dblclick', () => {
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

// Single click on avatar shows greeting
avatarSection.addEventListener('click', (e) => {
  if (speechBubbleContainer.classList.contains('hidden')) {
    if (window.sparkAudio) window.sparkAudio.popNotification();
    const activeName = SKINS[currentSkin].name;
    showNotification({
      id: 'greet_' + Date.now(),
      agent: currentSkin,
      state: 'calm',
      title: `Hi! I'm your desktop companion (${activeName})`,
      message: "I'm active and ready to alert you about your AI agents' tasks.\n\n💡 Tip: Double-click me to switch characters.",
      actions: ['Got it!'],
      timeout: 8,
      sound: false
    });
  }
});

// =========================================================
// 🔌 LISTEN TO ELECTRON IPC / BACKEND EVENTS
// =========================================================
if (window.sparkBridge) {
  window.sparkBridge.onServerEvent((eventData) => {
    if (eventData.type === 'state_changed' || eventData.type === 'init') {
      updateState(eventData.data);
    } else if (eventData.type === 'notification') {
      updateState(eventData.data);
      showNotification(eventData.data);
    } else if (eventData.type === 'dismiss') {
      hideBubble();
    } else if (eventData.type === 'set_skin') {
      updateState({ state: currentCharacterState, skin: eventData.skin });
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
    title: 'Capy is active! ☕🦫',
    message: "I'm your chill executive assistant. Coffee in hand, ready for tasks!\n\n💡 Double-click me to switch between Capy, Dr. Octopus, Astro, and Spark.",
    actions: ['Got it!'],
    timeout: 10,
    sound: true
  });
}, 800);

// ⚡ Spark & Astro Desktop UI Controller

const SKINS = {
  astro: {
    name: 'Astro 8-Bit',
    type: 'video',
    assets: {
      calm: '../../assets/astro/Astro_8bit_calm.mp4',
      working: '../../assets/astro/Astro_8bit_working.mp4',
      waiting: '../../assets/astro/Astro_connecting.mp4',
      connecting: '../../assets/astro/Astro_connecting.mp4',
      done: '../../assets/astro/Astro_done.mp4',
      error: '../../assets/astro/Astro_8bit_error.mp4'
    }
  },
  spark: {
    name: 'Classic Spark',
    type: 'image',
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

let currentSkin = 'astro';
let currentCharacterState = 'calm';
let currentAssetLoaded = '';

const AGENT_COLORS = {
  spark: { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)' },
  astro: { bg: 'rgba(249, 115, 22, 0.15)', text: '#fb923c', border: 'rgba(249, 115, 22, 0.3)' },
  claude: { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316', border: 'rgba(249, 115, 22, 0.3)' },
  antigravity: { bg: 'rgba(129, 140, 248, 0.15)', text: '#818cf8', border: 'rgba(129, 140, 248, 0.3)' },
  hermes: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
  openclaw: { bg: 'rgba(6, 182, 212, 0.15)', text: '#06b6d4', border: 'rgba(6, 182, 212, 0.3)' },
  codex: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' }
};

// DOM Elements
const sparkCanvas = document.getElementById('sparkCanvas');
const ctx = sparkCanvas.getContext('2d', { willReadFrequently: true });
const sparkImg = document.getElementById('sparkImg');
const sparkVideo = document.getElementById('sparkVideo');
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
// 🪄 FLOOD-FILL BOUNDARY TRANSPARENCY ENGINE
// Preserves the dark visor, eyes, shadows, and internal details.
// =========================================================
let isRendering = false;
let visitedBuffer = null;
let queueBuffer = null;

function startCanvasRenderLoop() {
  if (isRendering) return;
  isRendering = true;

  function renderFrame() {
    const width = sparkCanvas.width;
    const height = sparkCanvas.height;

    ctx.clearRect(0, 0, width, height);

    const activeSkin = SKINS[currentSkin] || SKINS.astro;

    if (activeSkin.type === 'video' && sparkVideo.readyState >= 2 && !sparkVideo.paused) {
      ctx.drawImage(sparkVideo, 0, 0, width, height);
      removeOuterBackgroundFloodFill(width, height);
    } else if (activeSkin.type === 'image' && sparkImg.complete && sparkImg.naturalWidth > 0) {
      ctx.drawImage(sparkImg, 0, 0, width, height);
      removeOuterBackgroundFloodFill(width, height);
    }

    requestAnimationFrame(renderFrame);
  }

  requestAnimationFrame(renderFrame);
}

function removeOuterBackgroundFloodFill(w, h) {
  try {
    const totalPixels = w * h;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    if (!visitedBuffer || visitedBuffer.length !== totalPixels) {
      visitedBuffer = new Uint8Array(totalPixels);
      queueBuffer = new Int32Array(totalPixels);
    } else {
      visitedBuffer.fill(0);
    }

    // Check if pixel is dark background from outside
    const isBgPixel = (idx) => {
      const r = data[idx * 4];
      const g = data[idx * 4 + 1];
      const b = data[idx * 4 + 2];
      return (r < 25 && g < 25 && b < 25);
    };

    let qLen = 0;

    // 1. Seed queue with all 4 outer border edges
    for (let x = 0; x < w; x++) {
      const top = x;
      const btm = (h - 1) * w + x;
      if (isBgPixel(top)) { visitedBuffer[top] = 1; queueBuffer[qLen++] = top; }
      if (isBgPixel(btm) && !visitedBuffer[btm]) { visitedBuffer[btm] = 1; queueBuffer[qLen++] = btm; }
    }
    for (let y = 0; y < h; y++) {
      const lft = y * w;
      const rgt = y * w + (w - 1);
      if (isBgPixel(lft) && !visitedBuffer[lft]) { visitedBuffer[lft] = 1; queueBuffer[qLen++] = lft; }
      if (isBgPixel(rgt) && !visitedBuffer[rgt]) { visitedBuffer[rgt] = 1; queueBuffer[qLen++] = rgt; }
    }

    // 2. BFS Flood Fill only towards contiguous outer background
    let head = 0;
    while (head < qLen) {
      const curr = queueBuffer[head++];
      data[curr * 4 + 3] = 0; // Pure transparency ONLY for outer background

      const cx = curr % w;
      const cy = (curr / w) | 0;

      // Left Neighbor
      if (cx > 0) {
        const n = curr - 1;
        if (!visitedBuffer[n] && isBgPixel(n)) { visitedBuffer[n] = 1; queueBuffer[qLen++] = n; }
      }
      // Right Neighbor
      if (cx < w - 1) {
        const n = curr + 1;
        if (!visitedBuffer[n] && isBgPixel(n)) { visitedBuffer[n] = 1; queueBuffer[qLen++] = n; }
      }
      // Top Neighbor
      if (cy > 0) {
        const n = curr - w;
        if (!visitedBuffer[n] && isBgPixel(n)) { visitedBuffer[n] = 1; queueBuffer[qLen++] = n; }
      }
      // Bottom Neighbor
      if (cy < h - 1) {
        const n = curr + w;
        if (!visitedBuffer[n] && isBgPixel(n)) { visitedBuffer[n] = 1; queueBuffer[qLen++] = n; }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  } catch (e) {
    // Context fallback
  }
}

sparkVideo.onerror = (e) => {
  console.error('❌ Error loading video:', sparkVideo.src);
  currentSkin = 'spark';
  updateState({ state: currentCharacterState, skin: 'spark' });
};

sparkVideo.onloadeddata = () => {
  console.log('🎬 Astro video ready to play:', sparkVideo.src);
  sparkVideo.play().catch(e => console.log('Autoplay handled:', e));
};

// =========================================================
// 🔄 STATE & CHARACTER UPDATE
// =========================================================
function updateState(stateData) {
  const { state = 'calm', agent = currentSkin, message = '', skin } = stateData;
  currentCharacterState = state;

  if (skin && SKINS[skin]) {
    currentSkin = skin;
  }

  // 1. Render active skin (Video or GIF)
  const activeSkin = SKINS[currentSkin] || SKINS.astro;
  const assetUrl = activeSkin.assets[state] || activeSkin.assets.calm;

  if (activeSkin.type === 'video') {
    if (currentAssetLoaded !== assetUrl) {
      currentAssetLoaded = assetUrl;
      sparkVideo.src = assetUrl;
      sparkVideo.load();
      sparkVideo.play().catch(e => console.log('Autoplay handled:', e));
    }
  } else {
    if (currentAssetLoaded !== assetUrl) {
      currentAssetLoaded = assetUrl;
      sparkImg.src = assetUrl;
    }
  }

  startCanvasRenderLoop();

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
  const name = capitalize(agent || (currentSkin === 'astro' ? 'Astro' : 'Spark'));
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
  const theme = AGENT_COLORS[key] || AGENT_COLORS.spark;

  agentBadge.style.backgroundColor = theme.bg;
  agentBadge.style.color = theme.text;
  agentBadge.style.borderColor = theme.border;
  agentNameText.textContent = capitalize(agentName || (currentSkin === 'astro' ? 'Astro' : 'Spark'));
}

// =========================================================
// 💬 NOTIFICATIONS & CLIPPY-STYLE SPEECH BUBBLE
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

  // Play corresponding sound
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

// Double click on avatar toggles character skin
avatarSection.addEventListener('dblclick', () => {
  currentSkin = currentSkin === 'astro' ? 'spark' : 'astro';
  if (window.sparkAudio) window.sparkAudio.popNotification();
  updateState({ state: currentCharacterState, agent: currentSkin, message: `Switched to ${SKINS[currentSkin].name}` });
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
    console.log('📥 Event received in Renderer:', eventData);

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

// Initial initialization
updateState({ state: 'calm', agent: 'astro', skin: 'astro', message: 'Astro Ready' });

// Startup welcome bubble
setTimeout(() => {
  showNotification({
    id: 'startup_welcome',
    agent: 'astro',
    state: 'calm',
    title: 'Astro is active! 🧑‍🚀',
    message: "I'm floating on your screen. You can drag me anywhere.\n\n💡 Double-click me to switch between Astro and Spark.",
    actions: ['Got it!'],
    timeout: 10,
    sound: true
  });
}, 800);

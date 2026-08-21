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
    name: 'Spark Clásico',
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

// Elementos del DOM
const sparkCanvas = document.getElementById('sparkCanvas');
const ctx = sparkCanvas.getContext('2d', { willReadFrequently: true });
const sparkImg = document.getElementById('sparkImg');
const sparkVideo = document.getElementById('sparkVideo');
const speechBubbleContainer = document.getElementById('speechBubbleContainer');

// =========================================================
// 🪄 MOTOR DE ELIMINACIÓN DE FONDO NEGRO (CHROMA-KEY EN TIEMPO REAL)
// =========================================================
let isRendering = false;

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
      removeBlackBackground(width, height);
    } else if (activeSkin.type === 'image' && sparkImg.complete && sparkImg.naturalWidth > 0) {
      ctx.drawImage(sparkImg, 0, 0, width, height);
      removeBlackBackground(width, height);
    }

    requestAnimationFrame(renderFrame);
  }

  requestAnimationFrame(renderFrame);
}

function removeBlackBackground(w, h) {
  try {
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const len = data.length;

    // Umbral de negro: todo pixel con RGB muy oscuro se vuelve 100% transparente
    const threshold = 35;

    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (r < threshold && g < threshold && b < threshold) {
        data[i + 3] = 0; // Transparencia total
      }
    }

    ctx.putImageData(imgData, 0, 0);
  } catch (e) {
    // Canvas context fallback
  }
}

sparkVideo.onerror = (e) => {
  console.error('❌ Error cargando video:', sparkVideo.src);
  currentSkin = 'spark';
  updateState({ state: currentCharacterState, skin: 'spark' });
};

sparkVideo.onloadeddata = () => {
  console.log('🎬 Video de Astro cargado y listo para reproducir:', sparkVideo.src);
  sparkVideo.play().catch(e => console.log('Autoplay play error:', e));
};
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
// 🔄 ACTUALIZACIÓN DE ESTADO & PERSONAJE
// =========================================================
function updateState(stateData) {
  const { state = 'calm', agent = currentSkin, message = '', skin } = stateData;
  currentCharacterState = state;

  if (skin && SKINS[skin]) {
    currentSkin = skin;
  }

  // 1. Renderizar según el Skin activo (Video o GIF)
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

  // 2. Color del Agente
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
    case 'working': return `${name} está escribiendo...`;
    case 'waiting': return `${name} espera confirmación`;
    case 'done': return `Tarea completada ✨`;
    case 'error': return `Error en ejecución ❌`;
    case 'connecting': return `Conectando con ${name}...`;
    default: return `${name} en reposo`;
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
// 💬 NOTIFICACIONES Y BOCADILLO ESTILO CLIPPY
// =========================================================
function showNotification(notif) {
  const {
    id,
    agent = currentSkin,
    state = 'waiting',
    title = 'Atención',
    message = '',
    code = '',
    actions = ['Aprobar', 'Rechazar'],
    timeout = 0,
    sound = true
  } = notif;

  currentNotificationId = id;
  if (bubbleTimer) clearTimeout(bubbleTimer);

  // Reproducir sonido correspondiente
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

  // Actualizar contenido del bocadillo
  applyAgentTheme(agent);
  bubbleTitle.textContent = title;
  bubbleMessage.textContent = message;

  if (code) {
    bubbleCode.textContent = code;
    bubbleCode.style.display = 'block';
  } else {
    bubbleCode.style.display = 'none';
  }

  // Generar botones de acción
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

  // Mostrar bocadillo
  speechBubbleContainer.classList.remove('hidden');

  // Timer de auto-cierre si se especifica
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

// Botón cerrar bocadillo
btnCloseBubble.addEventListener('click', () => {
  if (window.sparkAudio) window.sparkAudio.buttonClick();
  hideBubble();
});

// Doble click para alternar entre Astro y Spark
avatarSection.addEventListener('dblclick', () => {
  currentSkin = currentSkin === 'astro' ? 'spark' : 'astro';
  if (window.sparkAudio) window.sparkAudio.popNotification();
  updateState({ state: currentCharacterState, agent: currentSkin, message: `Cambiado a ${SKINS[currentSkin].name}` });
});

// Click simple en el avatar para mostrar mensaje amistoso o estado
avatarSection.addEventListener('click', (e) => {
  if (speechBubbleContainer.classList.contains('hidden')) {
    if (window.sparkAudio) window.sparkAudio.popNotification();
    const activeName = SKINS[currentSkin].name;
    showNotification({
      id: 'greet_' + Date.now(),
      agent: currentSkin,
      state: 'calm',
      title: `¡Hola! Soy tu asistente (${activeName})`,
      message: 'Estoy activo y listo para alertarte sobre cualquier evento de tus agentes de IA.\n\n💡 Tip: Haz doble clic sobre mí para cambiar de personaje.',
      actions: ['¡Entendido!'],
      timeout: 8,
      sound: false
    });
  }
});

// =========================================================
// 🔌 ESCUCHAR EVENTOS DESDE ELECTRON IPC / BACKEND
// =========================================================
if (window.sparkBridge) {
  window.sparkBridge.onServerEvent((eventData) => {
    console.log('📥 Evento recibido en Renderer:', eventData);

    if (eventData.type === 'state_changed' || eventData.type === 'init') {
      updateState(eventData.data);
    } else if (eventData.type === 'notification') {
      updateState(eventData.data);
      showNotification(eventData.data);
    } else if (eventData.type === 'dismiss') {
      hideBubble();
    } else if (eventData.type === 'set_skin') {
      updateState({ state: currentCharacterState, skin: eventData.skin });
    }
  });
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Inicialización inicial con Astro 8-Bit
updateState({ state: 'calm', agent: 'astro', skin: 'astro', message: 'Astro Listo' });

// Mostrar bocadillo inicial para que el usuario ubique a Astro/Spark de inmediato
setTimeout(() => {
  showNotification({
    id: 'startup_welcome',
    agent: 'astro',
    state: 'calm',
    title: '¡Astro está activo! 🧑‍🚀',
    message: 'Estoy flotando en tu pantalla. Puedes arrastrarme a donde quieras.\n\n💡 Haz doble clic sobre mí para alternar entre Astro y Spark.',
    actions: ['¡Entendido!'],
    timeout: 10,
    sound: true
  });
}, 800);

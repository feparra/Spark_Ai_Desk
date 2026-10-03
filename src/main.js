if (!module.paths.includes('C:/Users/ferna/.spark_desktop_runtime/node_modules')) {
  module.paths.push('C:/Users/ferna/.spark_desktop_runtime/node_modules');
}
const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const SparkServer = require('./server');
const WanderEngine = require('./wander');
const AgentRadar = require('./radar');

let mainWindow = null;
let tray = null;
let sparkServer = null;
let wanderEngine = null;
let agentRadar = null;
let currentSkinName = 'capy';

const PORT = process.env.SPARK_PORT || 7890;

// Prevent multiple instances of Spark
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.exit(0);
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

// 🚀 High-Performance Hardware Acceleration & Zero-CPU Flags
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

function getCharacterIcon(skin = currentSkinName) {
  const iconPath = path.join(__dirname, '..', 'assets', 'icons', `${skin}.png`);
  try {
    const img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) {
      return img.resize({ width: 32, height: 32 });
    }
  } catch (e) {}
  return nativeImage.createEmpty();
}

function updateTrayIcon(skin) {
  currentSkinName = skin || currentSkinName;
  if (tray) {
    const icon = getCharacterIcon(currentSkinName);
    if (!icon.isEmpty()) {
      tray.setImage(icon);
    }
    tray.setToolTip(`⚡ Spark AI Desktop Companion (${currentSkinName.toUpperCase()})`);
  }
}

function buildContextMenu() {
  return Menu.buildFromTemplate([
    {
      label: '⚡ Spark AI Desktop',
      enabled: false
    },
    { type: 'separator' },
    {
      label: '🚶 Autonomous Roam Mode (Multi-Monitor)',
      type: 'checkbox',
      checked: wanderEngine ? wanderEngine.enabled : false,
      click: (menuItem) => {
        if (wanderEngine) {
          wanderEngine.toggle(menuItem.checked);
        }
      }
    },
    {
      label: '🎭 Switch Character',
      submenu: [
        {
          label: '🦫 Capy (Executive)',
          click: () => {
            if (sparkServer) sparkServer.broadcast({ type: 'set_skin', skin: 'capy' });
            updateTrayIcon('capy');
          }
        },
        {
          label: '🦙 Llama (Gentleman)',
          click: () => {
            if (sparkServer) sparkServer.broadcast({ type: 'set_skin', skin: 'llama' });
            updateTrayIcon('llama');
          }
        },
        {
          label: '🐱 Kitty (Artist)',
          click: () => {
            if (sparkServer) sparkServer.broadcast({ type: 'set_skin', skin: 'kitty' });
            updateTrayIcon('kitty');
          }
        },
        {
          label: '🐦 Piper (Scholar)',
          click: () => {
            if (sparkServer) sparkServer.broadcast({ type: 'set_skin', skin: 'piper' });
            updateTrayIcon('piper');
          }
        },
        {
          label: '🐙 Dr. Octopus',
          click: () => {
            if (sparkServer) sparkServer.broadcast({ type: 'set_skin', skin: 'dr_octopus' });
            updateTrayIcon('dr_octopus');
          }
        },
        {
          label: '🧑‍🚀 Astro 8-Bit',
          click: () => {
            if (sparkServer) sparkServer.broadcast({ type: 'set_skin', skin: 'astro' });
            updateTrayIcon('astro');
          }
        },
        {
          label: '⚡ Classic Spark',
          click: () => {
            if (sparkServer) sparkServer.broadcast({ type: 'set_skin', skin: 'spark' });
            updateTrayIcon('spark');
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: '🎯 Bring to My Cursor Position',
      click: () => {
        if (mainWindow) {
          const pt = screen.getCursorScreenPoint();
          mainWindow.setPosition(Math.round(pt.x - 190), Math.round(pt.y - 230));
          mainWindow.show();
          mainWindow.focus();
          if (wanderEngine) wanderEngine.pauseForAgent();
          setTimeout(() => { if (wanderEngine) wanderEngine.resumeAfterAgent(6000); }, 2000);
        }
      }
    },
    {
      label: 'Show / Hide',
      click: () => {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
        }
      }
    },
    {
      label: 'Reset Position (Center)',
      click: () => {
        if (mainWindow) {
          mainWindow.center();
          mainWindow.show();
        }
      }
    },
    {
      label: '🧪 Test Agent Notification',
      submenu: [
        {
          label: 'Claude: Approval Required',
          click: () => {
            if (sparkServer) {
              sparkServer.broadcast({
                type: 'notification',
                data: {
                  id: 'test_' + Date.now(),
                  agent: 'claude',
                  state: 'waiting',
                  title: 'Claude needs confirmation',
                  message: 'Authorize running "npm test" in the terminal?',
                  actions: ['Approve', 'Reject'],
                  sound: true,
                  timestamp: Date.now()
                }
              });
            }
          }
        },
        {
          label: 'Antigravity: Task Completed',
          click: () => {
            if (sparkServer) {
              sparkServer.broadcast({
                type: 'notification',
                data: {
                  id: 'test_' + Date.now(),
                  agent: 'antigravity',
                  state: 'done',
                  title: 'Antigravity task completed',
                  message: 'All tests passed successfully ✨',
                  actions: ['Awesome', 'Close'],
                  sound: true,
                  timestamp: Date.now()
                }
              });
            }
          }
        },
        {
          label: 'State: Writing Code',
          click: () => {
            if (sparkServer) {
              sparkServer.updateState({
                state: 'working',
                agent: 'hermes',
                message: 'Hermes is generating components...'
              });
            }
          }
        },
        {
          label: 'State: Resting (Calm)',
          click: () => {
            if (sparkServer) {
              sparkServer.updateState({
                state: 'calm',
                agent: 'capy',
                message: 'Capy is resting...'
              });
            }
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'Quit Spark',
      click: () => {
        app.quit();
      }
    }
  ]);
}

function createSparkWindow() {
  const cursorPoint = screen.getCursorScreenPoint();
  const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
  const workArea = currentDisplay.workArea;

  const winWidth = 380;
  const winHeight = 460;
  
  // Center on active display
  const posX = Math.round(workArea.x + (workArea.width - winWidth) / 2);
  const posY = Math.round(workArea.y + (workArea.height - winHeight) / 2);

  console.log(`📍 Placing Spark on display [${currentDisplay.id}]: X=${posX}, Y=${posY}, Size=${winWidth}x${winHeight}`);

  const appIcon = getCharacterIcon(currentSkinName);

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: posX,
    y: posY,
    icon: appIcon,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
    console.error(`❌ Failed to load index.html: [${code}] ${desc}`);
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`🖥️ [Renderer Log]: ${message} (Line ${line})`);
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('❌ Render process crashed:', details);
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.center();
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true, 'floating');
    mainWindow.moveTop();
    mainWindow.focus();
    console.log('✅ Spark companion window shown and focused.');

    // Initialize Autonomous Multi-Monitor Wandering Engine
    wanderEngine = new WanderEngine(mainWindow, sparkServer);
    wanderEngine.start();
  });

  mainWindow.on('closed', () => {
    if (wanderEngine) wanderEngine.stop();
    mainWindow = null;
  });
}

function setupTray() {
  const icon = getCharacterIcon(currentSkinName);
  tray = new Tray(icon);
  tray.setToolTip(`⚡ Spark AI Desktop Companion (${currentSkinName.toUpperCase()})`);

  tray.on('click', () => {
    const contextMenu = buildContextMenu();
    tray.popUpContextMenu(contextMenu);
  });

  tray.on('right-click', () => {
    const contextMenu = buildContextMenu();
    tray.popUpContextMenu(contextMenu);
  });

  tray.setContextMenu(buildContextMenu());
}

app.whenReady().then(() => {
  createSparkWindow();
  setupTray();

  sparkServer = new SparkServer(PORT);
  sparkServer.start().then(() => {
    console.log('⚡ Spark Server initialized successfully');
    // Start background agent radar
    agentRadar = new AgentRadar(sparkServer);
    agentRadar.start();
  });

  sparkServer.broadcast = ((originalBroadcast) => {
    return function (messageObj) {
      originalBroadcast.call(sparkServer, messageObj);

      // Update tray icon on skin change
      if (messageObj.type === 'set_skin') {
        updateTrayIcon(messageObj.skin);
      }

      // Handle wander pausing/resuming based on agent activities
      if (wanderEngine) {
        if (messageObj.type === 'notification' || (messageObj.type === 'state_changed' && (messageObj.data.state === 'waiting' || messageObj.data.state === 'working' || messageObj.data.state === 'error'))) {
          wanderEngine.pauseForAgent();
        } else if (messageObj.type === 'dismiss' || (messageObj.type === 'state_changed' && (messageObj.data.state === 'calm' || messageObj.data.state === 'done'))) {
          wanderEngine.resumeAfterAgent(5000);
        } else if (messageObj.type === 'wander_toggle') {
          wanderEngine.toggle(messageObj.enabled);
        }
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server-event', messageObj);
      }
    };
  })(sparkServer.broadcast);

  // Right-click context menu from avatar
  ipcMain.on('show-context-menu', (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const menu = buildContextMenu();
      menu.popup({ window: mainWindow });
    }
  });

  ipcMain.on('user-action', (event, { id, action }) => {
    if (sparkServer) {
      sparkServer.handleActionSelected(id, action);
    }
  });

  // user-prompt handler — DISABLED (Quick-Input Hub desactivado por el usuario)
  // Para reactivar, descomentar el bloque de abajo
  /*
  ipcMain.on('user-prompt', (event, { targetAgent, prompt }) => {
    if (sparkServer) {
      const promptId = `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const target = (targetAgent || 'all').toLowerCase();
      
      const payload = {
        id: promptId,
        targetAgent: target,
        prompt: prompt,
        author: 'user',
        timestamp: Date.now()
      };

      if (!sparkServer.promptQueues.has(target)) {
        sparkServer.promptQueues.set(target, []);
      }
      sparkServer.promptQueues.get(target).push(payload);

      sparkServer.broadcast({
        type: 'agent_prompt_dispatched',
        data: payload
      });

      sparkServer.updateState({
        state: 'working',
        agent: target === 'all' ? 'spark' : target,
        message: `Working on: "${prompt.slice(0, 30)}..."`
      });
    }
  });
  */

  // Global Shortcut: Alt+Space — DISABLED (Quick-Input Hub desactivado por el usuario)
  // Para reactivar, descomentar el bloque de abajo
  /*
  try {
    globalShortcut.register('Alt+Space', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        if (sparkServer) {
          sparkServer.broadcast({ type: 'toggle_quick_input' });
        }
      }
    });
    console.log('⌨️ Global Shortcut [Alt+Space] registered for Spark Command Hub.');
  } catch (err) {
    console.warn('Could not register Alt+Space global shortcut:', err);
  }
  */

  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.hide();
  });

  ipcMain.on('toggle-always-on-top', (event, enable) => {
    if (mainWindow) mainWindow.setAlwaysOnTop(enable, 'screen-saver');
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

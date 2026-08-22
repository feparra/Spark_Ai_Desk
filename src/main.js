if (!module.paths.includes('C:/Users/ferna/.spark_desktop_runtime/node_modules')) {
  module.paths.push('C:/Users/ferna/.spark_desktop_runtime/node_modules');
}
const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const SparkServer = require('./server');
const WanderEngine = require('./wander');

let mainWindow = null;
let tray = null;
let sparkServer = null;
let wanderEngine = null;

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

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: posX,
    y: posY,
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
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
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
  const iconCanvas = nativeImage.createEmpty();
  tray = new Tray(iconCanvas);
  tray.setToolTip('⚡ Spark AI - Desktop Companion');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '⚡ Spark AI Desktop',
      enabled: false
    },
    { type: 'separator' },
    {
      label: '🚶 Autonomous Roam Mode (Multi-Monitor)',
      type: 'checkbox',
      checked: true,
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
          label: '🦫 Capy (Executive - New!)',
          click: () => {
            if (sparkServer) sparkServer.broadcast({ type: 'set_skin', skin: 'capy' });
          }
        },
        {
          label: '🐙 Dr. Octopus',
          click: () => {
            if (sparkServer) sparkServer.broadcast({ type: 'set_skin', skin: 'dr_octopus' });
          }
        },
        {
          label: '🧑‍🚀 Astro 8-Bit',
          click: () => {
            if (sparkServer) sparkServer.broadcast({ type: 'set_skin', skin: 'astro' });
          }
        },
        {
          label: '⚡ Classic Spark',
          click: () => {
            if (sparkServer) sparkServer.broadcast({ type: 'set_skin', skin: 'spark' });
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
                agent: 'spark',
                message: 'Spark is resting...'
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

  tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
  createSparkWindow();
  setupTray();

  sparkServer = new SparkServer(PORT);
  sparkServer.start().then(() => {
    console.log('⚡ Spark Server initialized successfully');
  });

  sparkServer.broadcast = ((originalBroadcast) => {
    return function (messageObj) {
      originalBroadcast.call(sparkServer, messageObj);

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

  ipcMain.on('user-action', (event, { id, action }) => {
    if (sparkServer) {
      sparkServer.handleActionSelected(id, action);
    }
    if (wanderEngine) {
      wanderEngine.resumeAfterAgent(4000);
    }
  });

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

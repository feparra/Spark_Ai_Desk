if (!module.paths.includes('C:/Users/ferna/.spark_desktop_runtime/node_modules')) {
  module.paths.push('C:/Users/ferna/.spark_desktop_runtime/node_modules');
}
const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const SparkServer = require('./server');

let mainWindow = null;
let tray = null;
let sparkServer = null;

const PORT = process.env.SPARK_PORT || 7890;

// Prevent multiple instances of Spark
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // If the user re-runs the launcher, bring window forward
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createSparkWindow() {
  const cursorPoint = screen.getCursorScreenPoint();
  const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
  const workArea = currentDisplay.workArea;

  const winWidth = 380;
  const winHeight = 460;
  
  // Center on the active display where user's cursor is located
  const posX = Math.round(workArea.x + (workArea.width - winWidth) / 2);
  const posY = Math.round(workArea.y + (workArea.height - winHeight) / 2);

  console.log(`📍 Placing Spark on active display [${currentDisplay.id}]: X=${posX}, Y=${posY}, Size=${winWidth}x${winHeight}`);

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
  });

  mainWindow.on('closed', () => {
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
      label: '🎭 Switch Character',
      submenu: [
        {
          label: '🧑‍🚀 Astro 8-Bit (Recommended)',
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server-event', messageObj);
      }
    };
  })(sparkServer.broadcast);

  ipcMain.on('user-action', (event, { id, action }) => {
    if (sparkServer) {
      sparkServer.handleActionSelected(id, action);
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

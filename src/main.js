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

// Evitar múltiples instancias de Spark
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Si el usuario vuelve a abrir el .bat, traer la ventana al frente
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
  
  // Ubicarlo centrado verticalmente hacia la derecha de la pantalla donde el usuario tiene el cursor
  const posX = Math.round(workArea.x + (workArea.width - winWidth) / 2);
  const posY = Math.round(workArea.y + (workArea.height - winHeight) / 2);

  console.log(`📍 Posicionando Spark en la pantalla activa [${currentDisplay.id}]: X=${posX}, Y=${posY}, Tamaño=${winWidth}x${winHeight}`);

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
    console.error(`❌ Error al cargar index.html: [${code}] ${desc}`);
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`🖥️ [Renderer Log]: ${message} (Línea ${line})`);
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('❌ Render process crashed:', details);
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.center(); // Centrar en pantalla
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    mainWindow.moveTop();
    mainWindow.focus();
    console.log('✅ Ventana de Spark centrada y mostrada en pantalla.');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupTray() {
  // Crear un icono simple si no hay asset de icono aún
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
      label: '🎭 Cambiar Personaje',
      submenu: [
        {
          label: '🧑‍🚀 Astro 8-Bit (Recomendado)',
          click: () => {
            if (sparkServer) sparkServer.broadcast({ type: 'set_skin', skin: 'astro' });
          }
        },
        {
          label: '⚡ Spark Clásico',
          click: () => {
            if (sparkServer) sparkServer.broadcast({ type: 'set_skin', skin: 'spark' });
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: '🎯 Traer a la Posición de mi Cursor',
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
      label: 'Mostrar / Ocultar',
      click: () => {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
        }
      }
    },
    {
      label: 'Resetear Posición',
      click: () => {
        if (mainWindow) {
          const { width, height } = screen.getPrimaryDisplay().workAreaSize;
          mainWindow.setPosition(width - 400, height - 480);
          mainWindow.show();
        }
      }
    },
    {
      label: '🧪 Probar Notificación de Agente',
      submenu: [
        {
          label: 'Claude: Aprobación requerida',
          click: () => {
            if (sparkServer) {
              sparkServer.broadcast({
                type: 'notification',
                data: {
                  id: 'test_' + Date.now(),
                  agent: 'claude',
                  state: 'waiting',
                  title: 'Claude requiere confirmación',
                  message: '¿Autorizas ejecutar "npm test" en la terminal?',
                  actions: ['Aprobar', 'Rechazar'],
                  sound: true,
                  timestamp: Date.now()
                }
              });
            }
          }
        },
        {
          label: 'Antigravity: Tarea completada',
          click: () => {
            if (sparkServer) {
              sparkServer.broadcast({
                type: 'notification',
                data: {
                  id: 'test_' + Date.now(),
                  agent: 'antigravity',
                  state: 'done',
                  title: 'Antigravity completó la tarea',
                  message: 'Todos los tests pasaron exitosamente ✨',
                  actions: ['Genial', 'Cerrar'],
                  sound: true,
                  timestamp: Date.now()
                }
              });
            }
          }
        },
        {
          label: 'Estado: Escribiendo código',
          click: () => {
            if (sparkServer) {
              sparkServer.updateState({
                state: 'working',
                agent: 'hermes',
                message: 'Hermes está generando el componente...'
              });
            }
          }
        },
        {
          label: 'Estado: Reposo (Calm)',
          click: () => {
            if (sparkServer) {
              sparkServer.updateState({
                state: 'calm',
                agent: 'spark',
                message: 'Spark está descansando...'
              });
            }
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'Salir de Spark',
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

  // Iniciar servidor local de eventos
  sparkServer = new SparkServer(PORT);
  sparkServer.start().then(() => {
    console.log('⚡ Servidor Spark inicializado correctamente');
  });

  // Reenviar eventos del servidor a la ventana de Electron
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

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sparkBridge', {
  sendAction: (id, action) => ipcRenderer.send('user-action', { id, action }),
  sendPrompt: (targetAgent, prompt) => ipcRenderer.send('user-prompt', { targetAgent, prompt }),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  toggleAlwaysOnTop: (enable) => ipcRenderer.send('toggle-always-on-top', enable),
  showContextMenu: () => ipcRenderer.send('show-context-menu'),
  onServerEvent: (callback) => {
    ipcRenderer.on('server-event', (event, data) => callback(data));
  }
});

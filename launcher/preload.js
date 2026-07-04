const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startDashboard: () => ipcRenderer.invoke('start-dashboard'),
  stopDashboard: () => ipcRenderer.invoke('stop-dashboard'),
  rebuildFrontend: () => ipcRenderer.invoke('rebuild-frontend'),
  openDashboard: () => ipcRenderer.invoke('open-dashboard'),
  openSyslite: () => ipcRenderer.invoke('open-syslite'),
  getStatus: () => ipcRenderer.invoke('get-status'),
  checkFirstRun: () => ipcRenderer.invoke('check-first-run'),
  firstTimeSetup: () => ipcRenderer.invoke('first-time-setup'),
  onLog: (callback) => ipcRenderer.on('log', (_event, data) => callback(data)),
  onStatus: (callback) => ipcRenderer.on('status', (_event, data) => callback(data)),
});

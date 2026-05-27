'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Receive live status pushes from main process (MQTT → IPC → renderer)
  onStatus: (cb) => ipcRenderer.on('mqtt:status', (_e, payload) => cb(payload)),

  // Receive connection state changes ('grey' | 'live' | 'black')
  onConnection: (cb) => ipcRenderer.on('mqtt:connection', (_e, state) => cb(state)),

  // One-time fetch of current status + connection state (for initial render)
  getStatus: () => ipcRenderer.invoke('status:get'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

  // Open external links in the default browser
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
});

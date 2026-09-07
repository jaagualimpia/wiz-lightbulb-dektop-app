const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wizApi', {
  getState: (ip) => ipcRenderer.invoke('wiz:getState', ip),
  setPower: (ip, on) => ipcRenderer.invoke('wiz:setPower', ip, on),
  setDimming: (ip, dimming) => ipcRenderer.invoke('wiz:setDimming', ip, dimming),
  setColor: (ip, rgb) => ipcRenderer.invoke('wiz:setColor', ip, rgb),
  setColorTemp: (ip, kelvin) => ipcRenderer.invoke('wiz:setColorTemp', ip, kelvin),
  discover: () => ipcRenderer.invoke('wiz:discover'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  getDefaultSettings: () => ipcRenderer.invoke('settings:getDefaults'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  onDiscoveryProgress: (callback) => {
    ipcRenderer.on('wiz:discoveryProgress', (_event, data) => callback(data));
  },
  onStateChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('wiz:stateChanged', listener);
    return () => ipcRenderer.removeListener('wiz:stateChanged', listener);
  },
});

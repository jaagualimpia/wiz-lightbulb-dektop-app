const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('feedbackApi', {
  onUpdate: (callback) => {
    ipcRenderer.on('feedback:update', (_event, feedback) => callback(feedback));
  },
});

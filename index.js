const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const wiz = require('./src/wizClient');
const { discoverBulbs } = require('./src/discovery');
const { loadConfig, saveConfig } = require('./src/config');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 720,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('wiz:getState', async (_event, ip) => {
  const response = await wiz.getPilot(ip);
  return response.result;
});

ipcMain.handle('wiz:setPower', async (_event, ip, on) => {
  const response = await wiz.setPower(ip, on);
  return response.result;
});

ipcMain.handle('wiz:setDimming', async (_event, ip, dimming) => {
  const response = await wiz.setDimming(ip, dimming);
  return response.result;
});

ipcMain.handle('wiz:setColor', async (_event, ip, rgb) => {
  const response = await wiz.setColor(ip, rgb);
  return response.result;
});

ipcMain.handle('wiz:setColorTemp', async (_event, ip, kelvin) => {
  const response = await wiz.setColorTemp(ip, kelvin);
  return response.result;
});

ipcMain.handle('wiz:discover', async (event) => {
  return discoverBulbs({
    onProgress: (scanned, total) => {
      event.sender.send('wiz:discoveryProgress', { scanned, total });
    },
  });
});

ipcMain.handle('config:get', () => loadConfig());

ipcMain.handle('config:save', (_event, config) => {
  saveConfig(config);
  return true;
});

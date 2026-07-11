const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const wiz = require('./src/wizClient');
const { discoverBulbs } = require('./src/discovery');
const { loadConfig, saveConfig } = require('./src/config');

const WARM_KELVIN = 2700;
const COOL_KELVIN = 6500;

let mainWindow;
let tray;
app.isQuitting = false;

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

  mainWindow.on('minimize', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function getBulbIp() {
  return loadConfig().ip;
}

async function runBulbAction(action) {
  const ip = getBulbIp();
  if (!ip) return;
  try {
    await action(ip);
  } catch (err) {
    console.error('Error al controlar la bombilla:', err.message || err);
  }
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png'));
  tray = new Tray(icon);
  tray.setToolTip('WiZ Bulb Control');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Luz cálida',
      click: () => runBulbAction((ip) => wiz.setColorTemp(ip, WARM_KELVIN)),
    },
    {
      label: 'Luz fría',
      click: () => runBulbAction((ip) => wiz.setColorTemp(ip, COOL_KELVIN)),
    },
    { type: 'separator' },
    {
      label: 'Encender',
      click: () => runBulbAction((ip) => wiz.setPower(ip, true)),
    },
    {
      label: 'Apagar',
      click: () => runBulbAction((ip) => wiz.setPower(ip, false)),
    },
    { type: 'separator' },
    {
      label: 'Mostrar ventana',
      click: () => {
        mainWindow.show();
      },
    },
    {
      label: 'Salir',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  app.isQuitting = true;
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

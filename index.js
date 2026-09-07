const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  globalShortcut,
  screen,
} = require('electron');
const path = require('path');
const wiz = require('./src/wizClient');
const { discoverBulbs } = require('./src/discovery');
const { DEFAULT_CONFIG, loadConfig, saveConfig } = require('./src/config');

const WARM_KELVIN = 2700;
const COOL_KELVIN = 6500;
const MIN_KELVIN = 2200;
const MAX_KELVIN = 6500;
const MIN_DIMMING = 1;
const MAX_DIMMING = 100;
const FEEDBACK_WIDTH = 320;
const FEEDBACK_HEIGHT = 92;

let mainWindow;
let feedbackWindow;
let tray;
let isTogglingPower = false;
let temperatureAdjustmentQueue = Promise.resolve();
let dimmingAdjustmentQueue = Promise.resolve();
let feedbackTimer;
let pendingFeedback;
app.isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 760,
    minWidth: 480,
    minHeight: 620,
    resizable: true,
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

function broadcastBulbState(state) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('wiz:stateChanged', state);
}

async function runBulbAction(action) {
  const ip = getBulbIp();
  if (!ip) {
    showFeedback({ icon: '!', title: 'Configura una bombilla', detail: 'No hay una dirección IP guardada', tone: 'error' });
    return undefined;
  }

  try {
    return await action(ip);
  } catch (err) {
    console.error('Error al controlar la bombilla:', err.message || err);
    showFeedback({ icon: '!', title: 'Bombilla sin conexión', detail: err.message || String(err), tone: 'error' });
    return undefined;
  }
}

async function setBulbPower(on) {
  await runBulbAction(async (ip) => {
    await wiz.setPower(ip, on);
    broadcastBulbState({ state: on });
    showFeedback({ icon: on ? 'ON' : 'OFF', title: on ? 'Luz encendida' : 'Luz apagada', tone: on ? 'success' : 'neutral' });
  });
}

async function toggleBulbPower() {
  if (isTogglingPower) return;

  isTogglingPower = true;
  try {
    await runBulbAction(async (ip) => {
      const response = await wiz.getPilot(ip);
      const currentState = response?.result?.state;

      if (typeof currentState !== 'boolean') {
        throw new Error('La bombilla no devolvió un estado de encendido válido');
      }

      const nextState = !currentState;
      await wiz.setPower(ip, nextState);
      broadcastBulbState({ state: nextState });
      showFeedback({
        icon: nextState ? 'ON' : 'OFF',
        title: nextState ? 'Luz encendida' : 'Luz apagada',
        tone: nextState ? 'success' : 'neutral',
      });
    });
  } finally {
    isTogglingPower = false;
  }
}

async function adjustColorTemperature(delta) {
  await runBulbAction(async (ip) => {
    const response = await wiz.getPilot(ip);
    const currentTemperature = response?.result?.temp;

    if (typeof currentTemperature !== 'number') {
      throw new Error('La bombilla no devolvió una temperatura de color válida');
    }

    const nextTemperature = Math.max(MIN_KELVIN, Math.min(MAX_KELVIN, currentTemperature + delta));
    await wiz.setColorTemp(ip, nextTemperature);
    broadcastBulbState({ temp: nextTemperature });
    showFeedback({ icon: 'K', title: 'Temperatura de color', detail: `${nextTemperature} K`, tone: 'warm' });
  });
}

async function setBulbTemperature(temperature) {
  await runBulbAction(async (ip) => {
    await wiz.setColorTemp(ip, temperature);
    broadcastBulbState({ temp: temperature });
    showFeedback({ icon: 'K', title: 'Temperatura de color', detail: `${temperature} K`, tone: 'warm' });
  });
}

async function adjustDimming(delta) {
  await runBulbAction(async (ip) => {
    const response = await wiz.getPilot(ip);
    const currentDimming = response?.result?.dimming;

    if (typeof currentDimming !== 'number') {
      throw new Error('La bombilla no devolvió un nivel de brillo válido');
    }

    const nextDimming = Math.max(MIN_DIMMING, Math.min(MAX_DIMMING, currentDimming + delta));
    await wiz.setDimming(ip, nextDimming);
    broadcastBulbState({ dimming: nextDimming });
    showFeedback({ icon: '%', title: 'Brillo', detail: `${nextDimming}%`, tone: 'brightness' });
  });
}

function createFeedbackWindow() {
  feedbackWindow = new BrowserWindow({
    width: FEEDBACK_WIDTH,
    height: FEEDBACK_HEIGHT,
    minWidth: FEEDBACK_WIDTH,
    minHeight: FEEDBACK_HEIGHT,
    maxWidth: FEEDBACK_WIDTH,
    maxHeight: FEEDBACK_HEIGHT,
    useContentSize: true,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'feedbackPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  feedbackWindow.setIgnoreMouseEvents(true);
  feedbackWindow.loadFile(path.join(__dirname, 'renderer', 'feedback.html'));
  feedbackWindow.webContents.on('did-finish-load', () => {
    feedbackWindow.webContents.setZoomFactor(1);
    void feedbackWindow.webContents.setVisualZoomLevelLimits(1, 1);
    if (pendingFeedback) {
      const feedback = pendingFeedback;
      pendingFeedback = null;
      showFeedback(feedback);
    }
  });
}

function positionFeedbackWindow() {
  if (!feedbackWindow || feedbackWindow.isDestroyed()) return;

  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  feedbackWindow.setBounds({
    x: workArea.x + workArea.width - FEEDBACK_WIDTH - 24,
    y: workArea.y + workArea.height - FEEDBACK_HEIGHT - 24,
    width: FEEDBACK_WIDTH,
    height: FEEDBACK_HEIGHT,
  }, false);
}

function showFeedback(feedback) {
  if (!loadConfig().feedbackEnabled) return;
  if (!feedbackWindow || feedbackWindow.isDestroyed()) return;

  if (feedbackWindow.webContents.isLoading()) {
    pendingFeedback = feedback;
    return;
  }

  positionFeedbackWindow();
  feedbackWindow.webContents.setZoomFactor(1);
  feedbackWindow.webContents.send('feedback:update', feedback);
  feedbackWindow.showInactive();

  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    if (feedbackWindow && !feedbackWindow.isDestroyed()) feedbackWindow.hide();
  }, 1600);
}

function queueTemperatureAdjustment(delta) {
  temperatureAdjustmentQueue = temperatureAdjustmentQueue.then(() => adjustColorTemperature(delta));
}

function queueDimmingAdjustment(delta) {
  dimmingAdjustmentQueue = dimmingAdjustmentQueue.then(() => adjustDimming(delta));
}

const shortcutHandlers = {
  togglePower: () => {
    void toggleBulbPower();
  },
  temperatureUp: () => {
    queueTemperatureAdjustment(loadConfig().temperatureStep);
  },
  temperatureDown: () => {
    queueTemperatureAdjustment(-loadConfig().temperatureStep);
  },
  dimmingUp: () => {
    queueDimmingAdjustment(loadConfig().dimmingStep);
  },
  dimmingDown: () => {
    queueDimmingAdjustment(-loadConfig().dimmingStep);
  },
};

function registerGlobalShortcuts(shortcuts = loadConfig().shortcuts) {
  globalShortcut.unregisterAll();
  const failures = [];
  const registeredAccelerators = new Set();

  Object.entries(shortcutHandlers).forEach(([name, callback]) => {
    const accelerator = shortcuts[name]?.trim();
    if (!accelerator) return;

    if (registeredAccelerators.has(accelerator.toLowerCase())) {
      failures.push(accelerator);
      return;
    }

    try {
      const registered = globalShortcut.register(accelerator, callback);
      if (!registered) {
        failures.push(accelerator);
        return;
      }
      registeredAccelerators.add(accelerator.toLowerCase());
    } catch {
      failures.push(accelerator);
    }
  });

  return failures;
}

function updateShortcutSettings(settings) {
  const previousConfig = loadConfig();
  const temperatureStep = Number(settings.temperatureStep);
  const dimmingStep = Number(settings.dimmingStep);

  if (!Number.isFinite(temperatureStep) || temperatureStep <= 0) {
    throw new Error('El incremento de temperatura debe ser mayor que cero.');
  }
  if (!Number.isFinite(dimmingStep) || dimmingStep <= 0) {
    throw new Error('El incremento de brillo debe ser mayor que cero.');
  }

  const nextShortcuts = {
    ...previousConfig.shortcuts,
    ...(settings.shortcuts || {}),
  };
  const failures = registerGlobalShortcuts(nextShortcuts);

  if (failures.length > 0) {
    registerGlobalShortcuts(previousConfig.shortcuts);
    throw new Error(`No se pudo registrar: ${failures.join(', ')}. Puede estar en uso por otra aplicación.`);
  }

  try {
    return saveConfig({
      shortcuts: nextShortcuts,
      temperatureStep,
      dimmingStep,
      feedbackEnabled: Boolean(settings.feedbackEnabled),
    });
  } catch (err) {
    registerGlobalShortcuts(previousConfig.shortcuts);
    throw err;
  }
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png'));
  tray = new Tray(icon);
  tray.setToolTip('WiZ Bulb Control');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Luz cálida',
      click: () => setBulbTemperature(WARM_KELVIN),
    },
    {
      label: 'Luz fría',
      click: () => setBulbTemperature(COOL_KELVIN),
    },
    { type: 'separator' },
    {
      label: 'Encender',
      click: () => setBulbPower(true),
    },
    {
      label: 'Apagar',
      click: () => setBulbPower(false),
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
  createFeedbackWindow();
  createTray();
  const failedShortcuts = registerGlobalShortcuts();

  if (failedShortcuts.length > 0) {
    showFeedback({
      icon: '!',
      title: 'Algunos atajos no están disponibles',
      detail: failedShortcuts.join(', '),
      tone: 'error',
    });
  }

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

ipcMain.handle('wiz:getState', async (_event, ip) => {
  const response = await wiz.getPilot(ip);
  return response.result;
});

ipcMain.handle('wiz:setPower', async (_event, ip, on) => {
  const response = await wiz.setPower(ip, on);
  broadcastBulbState({ state: on });
  return response.result;
});

ipcMain.handle('wiz:setDimming', async (_event, ip, dimming) => {
  const response = await wiz.setDimming(ip, dimming);
  broadcastBulbState({ dimming });
  return response.result;
});

ipcMain.handle('wiz:setColor', async (_event, ip, rgb) => {
  const response = await wiz.setColor(ip, rgb);
  broadcastBulbState(rgb);
  return response.result;
});

ipcMain.handle('wiz:setColorTemp', async (_event, ip, kelvin) => {
  const response = await wiz.setColorTemp(ip, kelvin);
  broadcastBulbState({ temp: kelvin });
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

ipcMain.handle('settings:getDefaults', () => ({
  shortcuts: { ...DEFAULT_CONFIG.shortcuts },
  temperatureStep: DEFAULT_CONFIG.temperatureStep,
  dimmingStep: DEFAULT_CONFIG.dimmingStep,
  feedbackEnabled: DEFAULT_CONFIG.feedbackEnabled,
}));

ipcMain.handle('settings:update', (_event, settings) => updateShortcutSettings(settings));

ipcMain.handle('config:save', (_event, config) => {
  return saveConfig(config);
});

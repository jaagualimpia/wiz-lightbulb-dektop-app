const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT_CONFIG = {
  ip: '',
  shortcuts: {
    togglePower: 'Control+Alt+E',
    temperatureUp: 'Control+Alt+Up',
    temperatureDown: 'Control+Alt+Down',
    dimmingUp: 'Control+Alt+Right',
    dimmingDown: 'Control+Alt+Left',
  },
  temperatureStep: 100,
  dimmingStep: 10,
  feedbackEnabled: true,
};

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8');
    const savedConfig = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...savedConfig,
      shortcuts: {
        ...DEFAULT_CONFIG.shortcuts,
        ...savedConfig.shortcuts,
      },
    };
  } catch {
    return {
      ...DEFAULT_CONFIG,
      shortcuts: { ...DEFAULT_CONFIG.shortcuts },
    };
  }
}

function saveConfig(partialConfig) {
  const currentConfig = loadConfig();
  const nextConfig = {
    ...currentConfig,
    ...partialConfig,
    shortcuts: {
      ...currentConfig.shortcuts,
      ...(partialConfig.shortcuts || {}),
    },
  };

  fs.writeFileSync(getConfigPath(), JSON.stringify(nextConfig, null, 2));
  return nextConfig;
}

module.exports = { DEFAULT_CONFIG, loadConfig, saveConfig };

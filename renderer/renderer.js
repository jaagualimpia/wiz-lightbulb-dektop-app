const ipInput = document.getElementById('ip-input');
const discoverBtn = document.getElementById('discover-btn');
const discoveryStatus = document.getElementById('discovery-status');
const powerToggle = document.getElementById('power-toggle');
const dimmingSlider = document.getElementById('dimming-slider');
const dimmingValue = document.getElementById('dimming-value');
const colorPicker = document.getElementById('color-picker');
const tempSlider = document.getElementById('temp-slider');
const tempValue = document.getElementById('temp-value');
const refreshBtn = document.getElementById('refresh-btn');
const stateOutput = document.getElementById('state-output');
const powerShortcutHint = document.getElementById('power-shortcut-hint');
const temperatureShortcutHint = document.getElementById('temperature-shortcut-hint');
const dimmingShortcutHint = document.getElementById('dimming-shortcut-hint');
const temperatureStepSelect = document.getElementById('temperature-step');
const dimmingStepSelect = document.getElementById('dimming-step');
const feedbackEnabled = document.getElementById('feedback-enabled');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const resetSettingsBtn = document.getElementById('reset-settings-btn');
const settingsStatus = document.getElementById('settings-status');

const shortcutInputs = {
  togglePower: document.getElementById('shortcut-toggle-power'),
  temperatureUp: document.getElementById('shortcut-temperature-up'),
  temperatureDown: document.getElementById('shortcut-temperature-down'),
  dimmingUp: document.getElementById('shortcut-dimming-up'),
  dimmingDown: document.getElementById('shortcut-dimming-down'),
};

let currentState = {};

function getIp() {
  return ipInput.value.trim();
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'))
    .join('')}`;
}

function formatShortcut(accelerator) {
  if (!accelerator) return '';
  return accelerator
    .replace('Control', 'Ctrl')
    .replace('Up', '↑')
    .replace('Down', '↓')
    .replace('Left', '←')
    .replace('Right', '→');
}

function setShortcutInput(input, accelerator) {
  input.dataset.accelerator = accelerator || '';
  input.value = accelerator ? formatShortcut(accelerator) : 'Desactivado';
}

function renderShortcutHints(shortcuts) {
  powerShortcutHint.textContent = formatShortcut(shortcuts.togglePower);
  temperatureShortcutHint.textContent = [shortcuts.temperatureDown, shortcuts.temperatureUp]
    .filter(Boolean)
    .map(formatShortcut)
    .join(' / ');
  dimmingShortcutHint.textContent = [shortcuts.dimmingDown, shortcuts.dimmingUp]
    .filter(Boolean)
    .map(formatShortcut)
    .join(' / ');
}

function populateSettings(config) {
  Object.entries(shortcutInputs).forEach(([name, input]) => {
    setShortcutInput(input, config.shortcuts[name]);
  });
  temperatureStepSelect.value = String(config.temperatureStep);
  dimmingStepSelect.value = String(config.dimmingStep);
  feedbackEnabled.checked = config.feedbackEnabled;
  renderShortcutHints(config.shortcuts);
}

function applyStateUpdate(state) {
  currentState = { ...currentState, ...state };
  stateOutput.textContent = JSON.stringify(currentState, null, 2);

  if (typeof state.state === 'boolean') powerToggle.checked = state.state;
  if (typeof state.dimming === 'number') {
    dimmingSlider.value = state.dimming;
    dimmingValue.textContent = state.dimming;
  }
  if (typeof state.temp === 'number') {
    tempSlider.value = state.temp;
    tempValue.textContent = state.temp;
  }
  if ([state.r, state.g, state.b].every((value) => typeof value === 'number')) {
    colorPicker.value = rgbToHex(state);
  }
}

function showError(err) {
  stateOutput.textContent = `Error: ${err.message || err}`;
}

async function loadState() {
  const ip = getIp();
  if (!ip) return;
  try {
    const state = await window.wizApi.getState(ip);
    currentState = {};
    applyStateUpdate(state);
  } catch (err) {
    showError(err);
  }
}

async function init() {
  const config = await window.wizApi.getConfig();
  populateSettings(config);
  if (config.ip) {
    ipInput.value = config.ip;
    await loadState();
  }
}

ipInput.addEventListener('change', () => {
  window.wizApi.saveConfig({ ip: getIp() });
});

discoverBtn.addEventListener('click', async () => {
  discoverBtn.disabled = true;
  discoveryStatus.textContent = 'Buscando bombillas en la red local...';

  window.wizApi.onDiscoveryProgress(({ scanned, total }) => {
    discoveryStatus.textContent = `Escaneando... ${scanned}/${total}`;
  });

  try {
    const results = await window.wizApi.discover();
    if (results.length === 0) {
      discoveryStatus.textContent = 'No se encontraron bombillas. Verifica que estés en la misma red.';
    } else {
      const first = results[0];
      ipInput.value = first.ip;
      window.wizApi.saveConfig({ ip: first.ip });
      discoveryStatus.textContent = `Encontrada(s): ${results.map((r) => r.ip).join(', ')}`;
      loadState();
    }
  } catch (err) {
    discoveryStatus.textContent = `Error durante la búsqueda: ${err.message || err}`;
  } finally {
    discoverBtn.disabled = false;
  }
});

powerToggle.addEventListener('change', async () => {
  const ip = getIp();
  if (!ip) return;
  try {
    await window.wizApi.setPower(ip, powerToggle.checked);
  } catch (err) {
    showError(err);
  }
});

const debouncedSetDimming = debounce(async (ip, value) => {
  try {
    await window.wizApi.setDimming(ip, value);
  } catch (err) {
    showError(err);
  }
}, 200);

dimmingSlider.addEventListener('input', () => {
  dimmingValue.textContent = dimmingSlider.value;
  const ip = getIp();
  if (!ip) return;
  debouncedSetDimming(ip, Number(dimmingSlider.value));
});

const debouncedSetColor = debounce(async (ip, rgb) => {
  try {
    await window.wizApi.setColor(ip, rgb);
  } catch (err) {
    showError(err);
  }
}, 200);

colorPicker.addEventListener('input', () => {
  const ip = getIp();
  if (!ip) return;
  debouncedSetColor(ip, hexToRgb(colorPicker.value));
});

const debouncedSetTemp = debounce(async (ip, kelvin) => {
  try {
    await window.wizApi.setColorTemp(ip, kelvin);
  } catch (err) {
    showError(err);
  }
}, 200);

tempSlider.addEventListener('input', () => {
  tempValue.textContent = tempSlider.value;
  const ip = getIp();
  if (!ip) return;
  debouncedSetTemp(ip, Number(tempSlider.value));
});

function acceleratorKeyFromEvent(event) {
  if (event.code.startsWith('Key')) return event.code.slice(3);
  if (event.code.startsWith('Digit')) return event.code.slice(5);
  if (/^F\d{1,2}$/.test(event.code)) return event.code;

  const keyByCode = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Space: 'Space',
    Enter: 'Enter',
    Tab: 'Tab',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
  };
  return keyByCode[event.code];
}

Object.values(shortcutInputs).forEach((input) => {
  input.addEventListener('focus', () => {
    input.classList.add('recording');
    input.value = 'Presiona una combinación…';
  });

  input.addEventListener('blur', () => {
    input.classList.remove('recording');
    setShortcutInput(input, input.dataset.accelerator);
  });

  input.addEventListener('keydown', (event) => {
    event.preventDefault();

    if (event.key === 'Escape') {
      input.blur();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      setShortcutInput(input, '');
      input.blur();
      return;
    }

    const key = acceleratorKeyFromEvent(event);
    if (!key) return;

    const modifiers = [];
    if (event.ctrlKey) modifiers.push('Control');
    if (event.altKey) modifiers.push('Alt');
    if (event.shiftKey) modifiers.push('Shift');
    if (event.metaKey) modifiers.push('Super');

    if (modifiers.length === 0) {
      settingsStatus.className = 'hint error';
      settingsStatus.textContent = 'El atajo debe incluir Ctrl, Alt, Shift o la tecla Windows.';
      return;
    }

    setShortcutInput(input, [...modifiers, key].join('+'));
    input.blur();
  });
});

saveSettingsBtn.addEventListener('click', async () => {
  saveSettingsBtn.disabled = true;
  settingsStatus.className = 'hint';
  settingsStatus.textContent = 'Guardando…';

  const shortcuts = Object.fromEntries(
    Object.entries(shortcutInputs).map(([name, input]) => [name, input.dataset.accelerator || '']),
  );

  try {
    const config = await window.wizApi.updateSettings({
      shortcuts,
      temperatureStep: Number(temperatureStepSelect.value),
      dimmingStep: Number(dimmingStepSelect.value),
      feedbackEnabled: feedbackEnabled.checked,
    });
    populateSettings(config);
    settingsStatus.className = 'hint success';
    settingsStatus.textContent = 'Preferencias guardadas. Los nuevos atajos ya están activos.';
  } catch (err) {
    settingsStatus.className = 'hint error';
    settingsStatus.textContent = err.message || String(err);
  } finally {
    saveSettingsBtn.disabled = false;
  }
});

resetSettingsBtn.addEventListener('click', async () => {
  const defaults = await window.wizApi.getDefaultSettings();
  populateSettings(defaults);
  settingsStatus.className = 'hint';
  settingsStatus.textContent = 'Valores restaurados. Pulsa “Guardar preferencias” para aplicarlos.';
});

refreshBtn.addEventListener('click', loadState);
window.wizApi.onStateChanged(applyStateUpdate);

init().catch(showError);

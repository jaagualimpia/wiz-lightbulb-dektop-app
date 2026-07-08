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

function showError(err) {
  stateOutput.textContent = `Error: ${err.message || err}`;
}

async function loadState() {
  const ip = getIp();
  if (!ip) return;
  try {
    const state = await window.wizApi.getState(ip);
    stateOutput.textContent = JSON.stringify(state, null, 2);

    if (typeof state.state === 'boolean') powerToggle.checked = state.state;
    if (typeof state.dimming === 'number') {
      dimmingSlider.value = state.dimming;
      dimmingValue.textContent = state.dimming;
    }
    if (typeof state.temp === 'number') {
      tempSlider.value = state.temp;
      tempValue.textContent = state.temp;
    }
  } catch (err) {
    showError(err);
  }
}

async function init() {
  const config = await window.wizApi.getConfig();
  if (config.ip) {
    ipInput.value = config.ip;
    loadState();
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

refreshBtn.addEventListener('click', loadState);

init();

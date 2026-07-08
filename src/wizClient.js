const dgram = require('dgram');

const WIZ_PORT = 38899;

/**
 * Sends a raw JSON-RPC style command to a WiZ bulb over UDP and waits for a response.
 * The bulb protocol has no session/auth; each request is independent (fire-and-wait).
 */
function sendCommand(ip, payload, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const message = Buffer.from(JSON.stringify(payload));

    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Timeout waiting for response from ${ip}`));
    }, timeoutMs);

    socket.once('message', (msg) => {
      clearTimeout(timer);
      socket.close();
      try {
        resolve(JSON.parse(msg.toString()));
      } catch (err) {
        reject(new Error(`Invalid JSON response from ${ip}: ${err.message}`));
      }
    });

    socket.once('error', (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });

    socket.send(message, 0, message.length, WIZ_PORT, ip, (err) => {
      if (err) {
        clearTimeout(timer);
        socket.close();
        reject(err);
      }
    });
  });
}

function getPilot(ip, timeoutMs) {
  return sendCommand(ip, { method: 'getPilot', params: {} }, timeoutMs);
}

function setState(ip, params, timeoutMs) {
  return sendCommand(ip, { id: 1, method: 'setState', params }, timeoutMs);
}

function setPower(ip, on) {
  return setState(ip, { state: on });
}

function setDimming(ip, dimming) {
  const clamped = Math.max(1, Math.min(100, Math.round(dimming)));
  return setState(ip, { dimming: clamped });
}

function setColor(ip, { r, g, b, w = 0, c = 0 }) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return setState(ip, { r: clamp(r), g: clamp(g), b: clamp(b), w: clamp(w), c: clamp(c) });
}

function setColorTemp(ip, kelvin) {
  const clamped = Math.max(2200, Math.min(6500, Math.round(kelvin)));
  return setState(ip, { temp: clamped });
}

module.exports = {
  WIZ_PORT,
  sendCommand,
  getPilot,
  setState,
  setPower,
  setDimming,
  setColor,
  setColorTemp,
};

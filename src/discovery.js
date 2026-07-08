const os = require('os');
const { getPilot } = require('./wizClient');

/**
 * Finds active local IPv4 subnets (e.g. "192.168.1") from network interfaces,
 * skipping internal/loopback addresses.
 */
function getLocalSubnets() {
  const interfaces = os.networkInterfaces();
  const subnets = new Set();

  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        const parts = entry.address.split('.');
        subnets.add(parts.slice(0, 3).join('.'));
      }
    }
  }

  return Array.from(subnets);
}

/**
 * Scans a /24 subnet for hosts responding on the WiZ UDP port with a valid getPilot reply.
 * Runs probes concurrently in small batches to avoid flooding the network.
 */
async function scanSubnet(subnet, { timeoutMs = 300, concurrency = 32, onProgress } = {}) {
  const hosts = [];
  for (let i = 1; i <= 254; i++) {
    hosts.push(`${subnet}.${i}`);
  }

  const found = [];
  let scanned = 0;

  for (let i = 0; i < hosts.length; i += concurrency) {
    const batch = hosts.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((ip) => getPilot(ip, timeoutMs))
    );

    results.forEach((result, idx) => {
      scanned++;
      if (result.status === 'fulfilled' && result.value?.result) {
        found.push({ ip: batch[idx], state: result.value.result });
      }
    });

    if (onProgress) onProgress(scanned, hosts.length);
  }

  return found;
}

async function discoverBulbs(options = {}) {
  const subnets = getLocalSubnets();
  const results = [];
  for (const subnet of subnets) {
    const found = await scanSubnet(subnet, options);
    results.push(...found);
  }
  return results;
}

module.exports = { getLocalSubnets, scanSubnet, discoverBulbs };

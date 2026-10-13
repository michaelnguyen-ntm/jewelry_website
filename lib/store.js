// Tiny key/value store for users and orders.
//
// If Upstash Redis credentials are present (Vercel Marketplace → Upstash sets
// KV_REST_API_URL / KV_REST_API_TOKEN), data is persisted there. Otherwise it
// falls back to process memory, which is fine locally but is wiped whenever a
// serverless instance restarts.
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const persistent = Boolean(url && token);

const memory = new Map();

async function redis(command) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Store request failed (${res.status})`);
  return (await res.json()).result;
}

async function get(key) {
  if (!persistent) return memory.get(key) ?? null;
  const raw = await redis(['GET', key]);
  return raw ? JSON.parse(raw) : null;
}

async function set(key, value) {
  if (!persistent) return void memory.set(key, value);
  await redis(['SET', key, JSON.stringify(value)]);
}

// Returns false (and writes nothing) if the key already exists.
async function setIfAbsent(key, value) {
  if (!persistent) {
    if (memory.has(key)) return false;
    memory.set(key, value);
    return true;
  }
  return (await redis(['SET', key, JSON.stringify(value), 'NX'])) === 'OK';
}

module.exports = { get, set, setIfAbsent, persistent };

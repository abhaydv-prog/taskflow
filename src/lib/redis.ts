// BullMQ needs a { host, port } style connection object, but our .env
// stores REDIS_URL as a single connection string for consistency with
// DATABASE_URL. Parse it once here so both the queue and the worker
// share the same logic.
function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
  };
}

export const redisConnection = parseRedisUrl(process.env.REDIS_URL || 'redis://localhost:6379');
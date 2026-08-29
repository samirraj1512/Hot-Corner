import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

const CONNECTION_TIMEOUT_MS = 5_000;

const getRedisUrl = () => String(
  process.env.WATCH_TOGETHER_REDIS_URL || process.env.REDIS_URL || "",
)
  .trim()
  // Accept a common copy/paste form such as REDIS_URL=rediss://... while
  // keeping the actual environment variable value as the Redis connection URL.
  .replace(/^(?:WATCH_TOGETHER_)?REDIS_URL=/i, "");

const waitForConnection = (client) => new Promise((resolve, reject) => {
  const timeoutId = setTimeout(() => reject(new Error("Redis connection timed out.")), CONNECTION_TIMEOUT_MS);
  client.connect()
    .then(() => {
      clearTimeout(timeoutId);
      resolve();
    })
    .catch((error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
});

const stopClient = (client) => {
  try {
    client.destroy();
  } catch {
    // The connection may not have opened yet.
  }
};

export const configureWatchTogetherRealtime = async (io) => {
  const url = getRedisUrl();
  if (!url) return { redisClient: null, shared: false };

  const clientOptions = {
    url,
    socket: {
      connectTimeout: CONNECTION_TIMEOUT_MS,
      reconnectStrategy: (retries) => Math.min(250 * 2 ** retries, 5_000),
    },
  };
  const publisher = createClient(clientOptions);
  const subscriber = publisher.duplicate();
  const stateClient = publisher.duplicate();
  const reportError = (name) => (error) => console.error(`Watch Together Redis ${name} error:`, error.message);
  publisher.on("error", reportError("publisher"));
  subscriber.on("error", reportError("subscriber"));
  stateClient.on("error", reportError("state client"));

  try {
    await Promise.all([waitForConnection(publisher), waitForConnection(subscriber), waitForConnection(stateClient)]);
    io.adapter(createAdapter(publisher, subscriber));
    console.log("Watch Together shared realtime state connected.");
    return { redisClient: stateClient, shared: true };
  } catch (error) {
    console.error(`Watch Together Redis is unavailable; keeping local-only realtime state. ${error.message}`);
    [publisher, subscriber, stateClient].forEach(stopClient);
    return { redisClient: null, shared: false };
  }
};

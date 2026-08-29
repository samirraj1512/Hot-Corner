import { createHmac } from "node:crypto";

const DEFAULT_STUN_SERVER = { urls: "stun:stun.l.google.com:19302" };
const TURN_CREDENTIAL_LIFETIME_SECONDS = 2 * 60 * 60;
const METERED_CACHE_REFRESH_MS = 10 * 60 * 1000;
const METERED_FAILURE_CACHE_MS = 60 * 1000;
const METERED_CREDENTIAL_CACHE = new Map();

const asUrlList = (value) => String(value || "")
  .split(",")
  .map((url) => url.trim())
  .filter((url) => /^(stun|turn|turns):/i.test(url));

const normalizeIceServers = (value) => {
  const servers = Array.isArray(value)
    ? value
    : Array.isArray(value?.iceServers)
      ? value.iceServers
      : Array.isArray(value?.data)
        ? value.data
        : [];

  return servers
    .map((server) => {
      const urls = Array.isArray(server?.urls)
        ? server.urls.filter((url) => /^(stun|turn|turns):/i.test(String(url || "")))
        : asUrlList(server?.urls);
      if (!urls.length) return null;
      return {
        urls: urls.length === 1 ? urls[0] : urls,
        ...(server.username ? { username: String(server.username) } : {}),
        ...(server.credential ? { credential: String(server.credential) } : {}),
        ...(server.credentialType ? { credentialType: String(server.credentialType) } : {}),
      };
    })
    .filter(Boolean);
};

const parseStaticIceServers = () => {
  try {
    return normalizeIceServers(JSON.parse(process.env.WATCH_TOGETHER_ICE_SERVERS || "[]"));
  } catch {
    return [];
  }
};

const getTurnServer = (userId) => {
  const urls = asUrlList(process.env.WATCH_TOGETHER_TURN_URLS || process.env.TURN_URLS);
  const secret = String(process.env.WATCH_TOGETHER_TURN_SHARED_SECRET || process.env.TURN_SHARED_SECRET || "");
  if (!urls.length || !secret) return null;

  const safeUserId = String(userId || "viewer").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) || "viewer";
  const username = `${Math.floor(Date.now() / 1000) + TURN_CREDENTIAL_LIFETIME_SECONDS}:${safeUserId}`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { urls, username, credential, credentialType: "password" };
};

const hasTurnUrl = (server) => {
  const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
  return urls.some((url) => /^turns?:/i.test(String(url || "")));
};

const getMeteredConfig = () => {
  const domain = String(process.env.METERED_TURN_DOMAIN || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const apiKey = String(
    process.env.METERED_TURN_API_KEY || process.env.METERED_TURN_CREDENTIAL_API_KEY || "",
  ).trim();
  const secretKey = String(process.env.METERED_TURN_SECRET_KEY || "").trim();
  const projectId = String(process.env.METERED_TURN_PROJECT_ID || "").trim();
  const credentialLabel = String(process.env.METERED_TURN_CREDENTIAL_LABEL || "").trim();
  const configured = Boolean(apiKey || secretKey);

  return {
    domain: /^[A-Za-z0-9.-]+$/.test(domain) ? domain : "",
    apiKey,
    secretKey,
    projectId,
    credentialLabel,
    configured,
  };
};

const getMeteredCredentialLifetime = () => Math.min(
  Math.max(Number(process.env.METERED_TURN_CREDENTIAL_TTL_SECONDS) || TURN_CREDENTIAL_LIFETIME_SECONDS, 300),
  14_400,
);

const readJson = async (response) => response.json().catch(() => ({}));

const fetchMeteredIceServers = async (domain, apiKey) => {
  const serversUrl = new URL(`https://${domain}/api/v1/turn/credentials`);
  serversUrl.searchParams.set("apiKey", apiKey);
  const serversResponse = await fetch(serversUrl);
  const payload = await readJson(serversResponse);
  if (!serversResponse.ok) throw new Error(`ICE server request returned ${serversResponse.status}`);

  const iceServers = normalizeIceServers(payload);
  if (!iceServers.some(hasTurnUrl)) throw new Error("no TURN servers were returned");
  return iceServers;
};

const createMeteredCredential = async ({ domain, secretKey, projectId, safeUserId, lifetime }) => {
  const createUrl = new URL(
    `https://${domain}/api/v2/turn/project/${encodeURIComponent(projectId)}/credential`,
  );
  createUrl.searchParams.set("secretKey", secretKey);
  const response = await fetch(createUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiryInSeconds: lifetime, label: `watch-${safeUserId}` }),
  });
  const credential = await readJson(response);
  if (!response.ok || !credential?.apiKey) {
    throw new Error(`credential request returned ${response.status}`);
  }
  return credential.apiKey;
};

const getExistingMeteredCredential = async ({ domain, secretKey, credentialLabel }) => {
  const credentialsUrl = new URL(`https://${domain}/api/v2/turn/credentials`);
  credentialsUrl.searchParams.set("secretKey", secretKey);
  if (credentialLabel) credentialsUrl.searchParams.set("label", credentialLabel);
  const response = await fetch(credentialsUrl);
  const payload = await readJson(response);
  if (!response.ok) throw new Error(`credential lookup returned ${response.status}`);

  const credentials = Array.isArray(payload?.data) ? payload.data : [];
  const credential = credentials.find((entry) => entry?.apiKey && !entry?.expired && !entry?.manuallyDisabled && !entry?.disabledByProjectRule);
  if (!credential?.apiKey) throw new Error("no active TURN credential was found");
  return credential.apiKey;
};

const getMeteredTurnServers = async (userId) => {
  const config = getMeteredConfig();
  if (!config.domain || !config.configured) return { iceServers: [], status: "not-configured" };

  const safeUserId = String(userId || "viewer").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "viewer";
  const cacheKey = config.apiKey ? "metered:api-key" : `metered:${safeUserId}`;
  const cached = METERED_CREDENTIAL_CACHE.get(cacheKey);
  if (cached?.expiresAt > Date.now()) return cached;

  try {
    const lifetime = getMeteredCredentialLifetime();
    const apiKey = config.apiKey
      || (config.projectId
        ? await createMeteredCredential({ ...config, safeUserId, lifetime })
        : await getExistingMeteredCredential(config));
    const iceServers = await fetchMeteredIceServers(config.domain, apiKey);
    const result = {
      iceServers,
      status: "ready",
      expiresAt: Date.now() + (config.apiKey ? METERED_CACHE_REFRESH_MS : Math.max(60_000, lifetime * 1000 - 60_000)),
    };
    METERED_CREDENTIAL_CACHE.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Watch Together Metered TURN credentials failed:", error.message);
    const result = {
      iceServers: [],
      status: "unavailable",
      expiresAt: Date.now() + METERED_FAILURE_CACHE_MS,
    };
    METERED_CREDENTIAL_CACHE.set(cacheKey, result);
    return result;
  }
};

const getIceTransportPolicy = (relayConfigured) => {
  const configuredPolicy = String(process.env.WATCH_TOGETHER_ICE_TRANSPORT_POLICY || "").toLowerCase();
  const forceRelay = configuredPolicy === "relay" || String(process.env.WATCH_TOGETHER_FORCE_RELAY || "").toLowerCase() === "true";
  return relayConfigured && forceRelay ? "relay" : "all";
};

export const getWatchTogetherIceServers = async (req, res) => {
  const userId = req.auth?.().userId;
  const turnServer = getTurnServer(userId);
  const metered = turnServer ? { iceServers: [], status: "not-configured" } : await getMeteredTurnServers(userId);
  const staticServers = parseStaticIceServers();
  const stunUrls = asUrlList(process.env.WATCH_TOGETHER_STUN_URLS);
  const relayConfigured = Boolean(turnServer || metered.iceServers.some(hasTurnUrl) || staticServers.some(hasTurnUrl));
  const iceServers = [
    ...(stunUrls.length ? [{ urls: stunUrls }] : [DEFAULT_STUN_SERVER]),
    ...staticServers,
    ...metered.iceServers,
    ...(turnServer ? [turnServer] : []),
  ];

  return res.json({
    success: true,
    iceServers,
    relayConfigured,
    relayStatus: relayConfigured ? "ready" : metered.status,
    iceTransportPolicy: getIceTransportPolicy(relayConfigured),
  });
};

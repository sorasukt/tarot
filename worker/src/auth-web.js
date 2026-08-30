const SESSION_COOKIE = "sorasukt_session";
const TX_COOKIE = "sorasukt_auth_tx";
const CALLBACK_PATH = "/auth/callback";
const DEFAULT_RETURN_TO = "https://sorasukt.com/tarot/";

export async function handleAuthRoute(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/auth/login") return startLogin(request, env);
  if (url.pathname === CALLBACK_PATH) return finishLogin(request, env);
  if (url.pathname === "/auth/logout") return logout(request, env);
  return null;
}

export async function getSession(request, env) {
  const raw = readCookie(request, SESSION_COOKIE);
  if (!raw) return null;
  const [payloadPart, signaturePart] = raw.split(".");
  if (!payloadPart || !signaturePart) return null;
  const expected = await sign(payloadPart, env.AUTH0_CLIENT_SECRET);
  if (!timingSafeEqual(signaturePart, expected)) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(payloadPart));
    if (!payload?.sub || !payload?.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function startLogin(request, env) {
  assertConfig(env);
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  const state = randomToken(32);
  const nonce = randomToken(32);
  const txPayload = encodeBase64Url(JSON.stringify({ state, nonce, returnTo, exp: Math.floor(Date.now() / 1000) + 600 }));
  const txSignature = await sign(txPayload, env.AUTH0_CLIENT_SECRET);

  const authorize = new URL(`https://${auth0Domain(env)}/authorize`);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", env.AUTH0_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", callbackUrl(request));
  authorize.searchParams.set("scope", "openid profile email");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("nonce", nonce);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      "Set-Cookie": `${TX_COOKIE}=${txPayload}.${txSignature}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      "Cache-Control": "no-store"
    }
  });
}

async function finishLogin(request, env) {
  assertConfig(env);
  const url = new URL(request.url);
  const transaction = await readTransaction(request, env);
  const clearTx = `${TX_COOKIE}=; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  if (!transaction) return authFailure(DEFAULT_RETURN_TO, "Authentication transaction expired", clearTx);
  if (url.searchParams.get("state") !== transaction.state) return authFailure(transaction.returnTo, "Authentication state mismatch", clearTx);
  if (url.searchParams.has("error")) return authFailure(transaction.returnTo, url.searchParams.get("error_description") || url.searchParams.get("error") || "Authentication failed", clearTx);

  const code = url.searchParams.get("code");
  if (!code) return authFailure(transaction.returnTo, "Authorization code missing", clearTx);

  const tokenResponse = await fetch(`https://${auth0Domain(env)}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: env.AUTH0_CLIENT_ID,
      client_secret: env.AUTH0_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl(request)
    })
  });
  if (!tokenResponse.ok) return authFailure(transaction.returnTo, "Unable to exchange authorization code", clearTx);

  const tokens = await tokenResponse.json();
  const claims = await verifyIdToken(tokens.id_token, env, transaction.nonce);
  if (!claims) return authFailure(transaction.returnTo, "Invalid Auth0 ID token", clearTx);

  const now = Math.floor(Date.now() / 1000);
  const exp = Math.min(Number(claims.exp) || now + 28800, now + 28800);
  const session = { sub: claims.sub, name: claims.name || null, nickname: claims.nickname || null, email: claims.email || null, picture: claims.picture || null, exp };

  if (env.DB) {
    try {
      await env.DB.prepare(`INSERT INTO member_accounts(user_sub,display_name,nickname,email,picture_url,last_seen_at,updated_at)
        VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(user_sub) DO UPDATE SET display_name=excluded.display_name,nickname=excluded.nickname,email=excluded.email,picture_url=excluded.picture_url,last_seen_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`)
        .bind(session.sub,session.name,session.nickname,session.email,session.picture).run();
    } catch (error) {
      console.warn("Unable to persist member account snapshot", error?.message || "error");
    }
  }

  const payload = encodeBase64Url(JSON.stringify(session));
  const signature = await sign(payload, env.AUTH0_CLIENT_SECRET);
  const maxAge = Math.max(60, exp - now);
  const headers = new Headers({ Location: transaction.returnTo, "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearTx);
  headers.append("Set-Cookie", `${SESSION_COOKIE}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
  return new Response(null, { status: 302, headers });
}

async function logout(request, env) {
  assertConfig(env);
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  const auth0Logout = new URL(`https://${auth0Domain(env)}/v2/logout`);
  auth0Logout.searchParams.set("client_id", env.AUTH0_CLIENT_ID);
  auth0Logout.searchParams.set("returnTo", returnTo);
  return new Response(null, {
    status: 302,
    headers: {
      Location: auth0Logout.toString(),
      "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      "Cache-Control": "no-store"
    }
  });
}

async function readTransaction(request, env) {
  const raw = readCookie(request, TX_COOKIE);
  if (!raw) return null;
  const [payloadPart, signaturePart] = raw.split(".");
  if (!payloadPart || !signaturePart) return null;
  const expected = await sign(payloadPart, env.AUTH0_CLIENT_SECRET);
  if (!timingSafeEqual(signaturePart, expected)) return null;
  try {
    const tx = JSON.parse(decodeBase64Url(payloadPart));
    if (!tx?.state || !tx?.nonce || !tx?.exp || tx.exp <= Math.floor(Date.now() / 1000)) return null;
    tx.returnTo = safeReturnTo(tx.returnTo);
    return tx;
  } catch {
    return null;
  }
}

async function verifyIdToken(token, env, expectedNonce) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(decodeBase64Url(parts[0]));
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    if (header.alg !== "RS256" || !header.kid) return null;
    const issuer = `https://${auth0Domain(env)}/`;
    const now = Math.floor(Date.now() / 1000);
    const audienceOk = Array.isArray(payload.aud) ? payload.aud.includes(env.AUTH0_CLIENT_ID) : payload.aud === env.AUTH0_CLIENT_ID;
    if (payload.iss !== issuer || !audienceOk || payload.exp <= now || payload.iat > now + 60 || payload.nonce !== expectedNonce || !payload.sub) return null;

    const jwks = await fetch(`https://${auth0Domain(env)}/.well-known/jwks.json`, { headers: { Accept: "application/json" } });
    if (!jwks.ok) return null;
    const body = await jwks.json();
    const jwk = body?.keys?.find(key => key.kid === header.kid && key.kty === "RSA");
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlBytes(parts[2]), data);
    return valid ? payload : null;
  } catch {
    return null;
  }
}

function authFailure(returnTo, message, clearCookie) {
  const target = new URL(safeReturnTo(returnTo));
  target.searchParams.set("auth_error", message);
  return new Response(null, { status: 302, headers: { Location: target.toString(), "Set-Cookie": clearCookie, "Cache-Control": "no-store" } });
}

function safeReturnTo(value) {
  try {
    const url = new URL(value || DEFAULT_RETURN_TO);
    if (url.protocol !== "https:") return DEFAULT_RETURN_TO;
    if (url.hostname !== "sorasukt.com" && url.hostname !== "www.sorasukt.com") return DEFAULT_RETURN_TO;
    if (!url.pathname.startsWith("/tarot")) return DEFAULT_RETURN_TO;
    return url.toString();
  } catch {
    return DEFAULT_RETURN_TO;
  }
}

function callbackUrl(request) { return `${new URL(request.url).origin}${CALLBACK_PATH}`; }
function auth0Domain(env) { return (env.AUTH0_DOMAIN || "auth.sorasukt.com").replace(/^https?:\/\//, "").replace(/\/$/, ""); }
function assertConfig(env) { if (!env.AUTH0_CLIENT_ID || !env.AUTH0_CLIENT_SECRET) throw new Error("Auth0 Regular Web Application is not configured"); }
function readCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}
async function sign(value, secret) {
  if (!secret) return "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`sorasukt-auth-session-v1:${secret}`));
  const key = await crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return encodeBase64UrlBytes(new Uint8Array(signature));
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function randomToken(length) { const bytes = new Uint8Array(length); crypto.getRandomValues(bytes); return encodeBase64UrlBytes(bytes); }
function encodeBase64Url(value) { return encodeBase64UrlBytes(new TextEncoder().encode(value)); }
function encodeBase64UrlBytes(bytes) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function decodeBase64Url(value) { return new TextDecoder().decode(base64UrlBytes(value)); }
function base64UrlBytes(value) { const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4); const binary = atob(base64); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes; }

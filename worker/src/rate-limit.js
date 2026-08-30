import {enforceDailyFeatureLimit} from "./entitlements.js";

const LIMIT_ERROR_MESSAGE = "มีคำขอจำนวนมากเกินไป กรุณารอหนึ่งนาทีแล้วลองใหม่";

export async function enforceAiRateLimit(request, env, actorId = "") {
  if (!env.AI_RATE_LIMITER) {
    console.error(JSON.stringify({ message: "AI rate limiter binding is unavailable" }));
    return errorResult(503, "RATE_LIMIT_UNAVAILABLE", "ระบบควบคุมการใช้งานไม่พร้อมใช้งาน");
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const actor = actorId ? `user:${actorId}` : `ip:${ip}`;
  try {
    const { success } = await env.AI_RATE_LIMITER.limit({ key: `sorasukt-api:${actor}` });
    if (!success) return errorResult(429, "RATE_LIMITED", LIMIT_ERROR_MESSAGE, 60);
  } catch (error) {
    console.error(JSON.stringify({ message: "AI rate limiter failed", error: error?.message || "error" }));
    return errorResult(503, "RATE_LIMIT_UNAVAILABLE", "ระบบควบคุมการใช้งานไม่พร้อมใช้งาน");
  }

  const feature = quotaFeature(new URL(request.url).pathname);
  if (!feature) return { allowed: true };
  try {
    return await enforceDailyFeatureLimit(request, env, actorId ? { sub: actorId } : null, feature);
  } catch (error) {
    console.error(JSON.stringify({ message: "Daily entitlement check failed", feature, error: error?.message || "error" }));
    return errorResult(503, "LIMIT_STORAGE_UNAVAILABLE", "ระบบตรวจสอบสิทธิ์การใช้งานไม่พร้อมใช้งาน");
  }
}

function quotaFeature(pathname) {
  if (pathname === "/api/tarot/reading") return "tarot";
  if (pathname === "/api/tts/reading") return "tts";
  if (pathname === "/api/member/astrology" || pathname.startsWith("/api/fortune/astrology")) return "astrology";
  return "";
}

function errorResult(status, code, message, retryAfter = 0) {
  return { allowed: false, status, code, message, retryAfter };
}

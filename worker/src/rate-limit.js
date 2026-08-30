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
    return success ? { allowed: true } : errorResult(429, "RATE_LIMITED", LIMIT_ERROR_MESSAGE, 60);
  } catch (error) {
    console.error(JSON.stringify({ message: "AI rate limiter failed", error: error?.message || "error" }));
    return errorResult(503, "RATE_LIMIT_UNAVAILABLE", "ระบบควบคุมการใช้งานไม่พร้อมใช้งาน");
  }
}

function errorResult(status, code, message, retryAfter = 0) {
  return { allowed: false, status, code, message, retryAfter };
}

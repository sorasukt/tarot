export class RequestBodyError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "RequestBodyError";
    this.code = code;
    this.status = status;
  }
}

export async function readJsonBody(request, maxBytes = 12_000) {
  const text=await readTextBody(request,maxBytes);
  try {
    return JSON.parse(text);
  } catch {
    throw invalidJson();
  }
}

export async function readTextBody(request, maxBytes = 12_000) {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw tooLarge();
  }
  if (!request.body) {
    throw invalidJson();
  }

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("Request body exceeds configured limit");
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bytes);
}

function tooLarge() {
  return new RequestBodyError("REQUEST_TOO_LARGE", "Request is too large", 413);
}

function invalidJson() {
  return new RequestBodyError("INVALID_REQUEST", "Invalid JSON request", 400);
}

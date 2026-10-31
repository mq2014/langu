// 览古后端共享工具：密码哈希、会话、Cookie、JSON 响应
// 注意：本文件不导出 onRequest，不会被当作路由，仅作为模块被其它函数 import。

export function j(status, obj, setCookie) {
  const headers = { "Content-Type": "application/json; charset=utf-8" };
  if (setCookie) headers["Set-Cookie"] = setCookie;
  return new Response(JSON.stringify(obj), { status, headers });
}

export function randHex(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(h) {
  const a = [];
  for (let i = 0; i < h.length; i += 2) a.push(parseInt(h.substr(i, 2), 16));
  return new Uint8Array(a);
}

// PBKDF2-SHA256（10 万次），与 salt 一起存储，避免明文密码落库
export async function hashPw(pw, saltHex) {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey(
    "raw",
    enc.encode(pw),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(saltHex), iterations: 100000, hash: "SHA-256" },
    km,
    256
  );
  return [...new Uint8Array(bits)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function sessionCookie(token) {
  return `langu_sid=${token}; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=${60 * 60 * 24 * 30}`;
}

export function clearCookie() {
  return `langu_sid=; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=0`;
}

export function parseCookies(req) {
  const h = req.headers.get("cookie");
  const out = {};
  if (!h) return out;
  h.split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

export async function userIdFromSession(env, req) {
  const c = parseCookies(req);
  const token = c["langu_sid"];
  if (!token) return null;
  const s = await env.DB.prepare(
    "SELECT user_id, expires_at FROM sessions WHERE token = ?"
  ).bind(token).first();
  if (!s) return null;
  if (s.expires_at < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return s.user_id;
}

export async function newSession(env, userId) {
  const token = crypto.randomUUID();
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 30;
  await env.DB.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
  ).bind(token, userId, exp).run();
  return token;
}

export async function destroySession(env, req) {
  const c = parseCookies(req);
  const token = c["langu_sid"];
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
}

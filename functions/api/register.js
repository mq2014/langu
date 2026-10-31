import { j, randHex, hashPw, sessionCookie, newSession } from "./lib.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return j(400, { error: "请求格式错误" });
  }
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) return j(400, { error: "请填写名称与密码" });
  if (username.length > 24 || password.length < 4 || password.length > 64)
    return j(400, { error: "名称≤24字，密码4-64位" });
  if (!/^[一-龥\w .\-]+$/.test(username))
    return j(400, { error: "名称含非法字符" });

  const salt = randHex(16);
  const passHash = await hashPw(password, salt);
  try {
    await env.DB.prepare(
      "INSERT INTO users (username, pass_hash, salt, created_at) VALUES (?, ?, ?, ?)"
    ).bind(username, passHash, salt, Date.now()).run();
  } catch (e) {
    if (String(e.message || "").toUpperCase().includes("UNIQUE"))
      return j(409, { error: "该名称已被占用，请换一个或登录" });
    return j(500, { error: "注册失败，请稍后再试" });
  }
  const user = await env.DB.prepare("SELECT id FROM users WHERE username = ?")
    .bind(username).first();
  const token = await newSession(env, user.id);
  return j(200, { ok: true, username }, sessionCookie(token));
}

import { j, hashPw, sessionCookie, newSession } from "./lib.js";

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

  const row = await env.DB.prepare(
    "SELECT id, pass_hash, salt FROM users WHERE username = ?"
  ).bind(username).first();
  if (!row) return j(401, { error: "没有这个账号，请先注册" });

  const h = await hashPw(password, row.salt);
  if (h !== row.pass_hash) return j(401, { error: "密码不对，再试试" });

  const token = await newSession(env, row.id);
  return j(200, { ok: true, username }, sessionCookie(token));
}

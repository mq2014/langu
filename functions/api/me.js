import { j, userIdFromSession } from "./lib.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const uid = await userIdFromSession(env, request);
  if (!uid) return j(200, { loggedIn: false });
  const u = await env.DB.prepare("SELECT username FROM users WHERE id = ?")
    .bind(uid).first();
  if (!u) return j(200, { loggedIn: false });
  return j(200, { loggedIn: true, username: u.username });
}

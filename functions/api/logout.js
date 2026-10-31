import { j, destroySession, clearCookie } from "./lib.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  await destroySession(env, request);
  return j(200, { ok: true }, clearCookie());
}

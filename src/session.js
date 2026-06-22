// session.js — cliente de sesión contra el backend. Robustez: timeout en las
// llamadas para que un servidor caído/URL vieja dé un ERROR CLARO y no un spinner
// infinito. La cookie HttpOnly la maneja el navegador.

async function pedir(url, opts = {}, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    throw new Error(e.name === "AbortError"
      ? "El servidor no respondió. ¿Está corriendo? Mirá la consola de 'npm start'."
      : "No se pudo conectar al servidor (¿URL o puerto correcto?).");
  } finally {
    clearTimeout(t);
  }
}

export async function me() {
  try {
    const r = await pedir("/api/auth/me", {}, 6000);
    return r.ok ? r.json() : null;
  } catch {
    return null; // sin backend → mostramos login (no colgamos la app)
  }
}

export async function login(email, password) {
  const r = await pedir("/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
  return r.json();
}

export async function logout() {
  try { await pedir("/api/auth/logout", { method: "POST" }, 6000); } catch {}
}

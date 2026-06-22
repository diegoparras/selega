// storage.js — Capa de datos ÚNICA de Selega. Todo acceso a persistencia pasa por
// acá: namespaced, con (de)serialización JSON segura y un solo punto para endurecer
// o cambiar el backend (hoy localStorage; mañana un proxy del Consejo) sin tocar el
// resto del código. Escalabilidad + seguridad concentradas en un módulo.

const NS = "selega";
const k = (key) => `${NS}.${key}`;

export const storage = {
  get(key, def = null) {
    const v = localStorage.getItem(k(key));
    return v == null ? def : v;
  },
  getJSON(key, def = null) {
    try {
      const v = localStorage.getItem(k(key));
      return v == null ? def : JSON.parse(v);
    } catch {
      return def; // dato corrupto → default, nunca rompe la app
    }
  },
  set(key, val) {
    if (val == null) return this.remove(key);
    localStorage.setItem(k(key), String(val));
  },
  setJSON(key, val) {
    localStorage.setItem(k(key), JSON.stringify(val));
  },
  remove(key) {
    localStorage.removeItem(k(key));
  },
};

// llm.js — Capa de procesamiento con LLM (OpenRouter, multimodelo). GATEADA.
// Apagada por defecto. La ÚNICA petición externa de toda la app vive acá, y está
// triplemente cerrada: (1) habilitada en Admin, (2) API key cargada, (3)
// autorización explícita por documento. Sin esto, Selega es 100% local.

import { storage } from "./storage.js";
const DEFAULT_MODEL = "openai/gpt-4o-mini"; // OpenRouter acepta cualquier modelo

export const llmConfig = {
  get enabled() { return storage.get("llm.enabled") === "1"; },
  set enabled(v) { storage.set("llm.enabled", v ? "1" : "0"); },
  get key() { return storage.get("llm.key", ""); },
  set key(v) { storage.set("llm.key", v || ""); },
  get model() { return storage.get("llm.model", DEFAULT_MODEL); },
  set model(v) { storage.set("llm.model", v || DEFAULT_MODEL); },
};

export const llmDisponible = () => llmConfig.enabled && !!llmConfig.key;

// Procesa SOLO si: habilitado + key + `autorizar()` devuelve true (consentimiento).
export async function procesarConLLM({ system, user, schema }, autorizar) {
  if (!llmConfig.enabled) throw new Error("Procesamiento LLM deshabilitado (Admin).");
  if (!llmConfig.key) throw new Error("Falta API key de OpenRouter (Admin).");
  if (!(await autorizar?.())) throw new Error("Envío a la nube no autorizado.");

  const body = {
    model: llmConfig.model,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    ...(schema && { response_format: { type: "json_schema", json_schema: { name: "cifras", schema } } }),
  };
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${llmConfig.key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://selega.local", "X-Title": "Selega",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  return (await res.json()).choices?.[0]?.message?.content ?? null;
}

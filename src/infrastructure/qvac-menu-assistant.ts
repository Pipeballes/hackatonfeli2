import type { MenuItem } from "../domain/model.js";

interface QvacModelsResponse { data?: Array<{ id?: string }> }
interface QvacChatResponse { choices?: Array<{ message?: { content?: string } }> }

export interface GroundedMenuSuggestion {
  title: string;
  message: string;
  items: MenuItem[];
}

export async function tryQvacMenuAssistant(question: string, grounded: GroundedMenuSuggestion) {
  const base = new URL(process.env.QVAC_BASE_URL ?? "http://127.0.0.1:11434/v1/");
  if (!isLoopback(base.hostname)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const model = process.env.QVAC_MODEL?.trim() || await discoverModel(base, controller.signal);
    if (!model) return null;
    const allowed = grounded.items.map((item) => ({ name: item.name, description: item.description, category: item.category }));
    const response = await fetch(new URL("chat/completions", base), {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 110,
        reasoning_budget: 0,
        messages: [
          {
            role: "system",
            content: "Sos el asistente local de un restaurante. Respondé en español rioplatense, breve y amable. Sólo podés recomendar platos incluidos en ALLOWED_ITEMS. No inventes ingredientes, precios, disponibilidad ni productos. Si falta información, decilo.",
          },
          {
            role: "user",
            content: `Consulta: ${question}\nALLOWED_ITEMS=${JSON.stringify(allowed)}\nSugerencia determinista de respaldo: ${grounded.message}`,
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const body = await response.json() as QvacChatResponse;
    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content || content.length > 700) return null;
    return {
      engine: "QVAC_LOCAL" as const,
      title: grounded.title,
      message: content,
      items: grounded.items,
      note: `Respuesta generada localmente con QVAC (${model}) y anclada a productos reales del menú.`,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverModel(base: URL, signal: AbortSignal) {
  const response = await fetch(new URL("models", base), { signal });
  if (!response.ok) return null;
  const body = await response.json() as QvacModelsResponse;
  return body.data?.find((model) => typeof model.id === "string" && model.id.length > 0)?.id ?? null;
}

function isLoopback(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

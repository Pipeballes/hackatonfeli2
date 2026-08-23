import type { MenuItem } from "../domain/model.js";

interface QvacModelsResponse { data?: Array<{ id?: string }> }
interface QvacChatResponse { choices?: Array<{ message?: { content?: string } }> }
interface QvacChoice { itemIds?: unknown }

export interface GroundedMenuSuggestion {
  title: string;
  message: string;
  items: MenuItem[];
}

export async function tryQvacMenuAssistant(question: string, grounded: GroundedMenuSuggestion) {
  let base: URL;
  try { base = new URL(process.env.QVAC_BASE_URL ?? "http://127.0.0.1:11434/v1/"); } catch { return null; }
  if (!isLoopback(base.hostname) || grounded.items.length === 0) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const model = process.env.QVAC_MODEL?.trim() || await discoverModel(base, controller.signal);
    if (!model) return null;
    const allowedIds = grounded.items.map((item) => item.id);
    const allowed = grounded.items.map((item) => ({ id: item.id, name: item.name, description: item.description, category: item.category }));
    const response = await fetch(new URL("chat/completions", base), {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 90,
        reasoning_budget: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "menu_choice",
            strict: true,
            schema: {
              type: "object",
              properties: { itemIds: { type: "array", minItems: 1, maxItems: Math.min(3, allowedIds.length), items: { type: "string", enum: allowedIds } } },
              required: ["itemIds"],
              additionalProperties: false,
            },
          },
        },
        messages: [
          { role: "system", content: "Elegí exclusivamente IDs de ALLOWED_ITEMS que respondan mejor a la consulta. Nunca inventes IDs, platos, ingredientes, precios ni disponibilidad. Devolvé sólo el JSON solicitado." },
          { role: "user", content: `Consulta: ${question}\nALLOWED_ITEMS=${JSON.stringify(allowed)}` },
        ],
      }),
    });
    if (!response.ok) return null;
    const body = await response.json() as QvacChatResponse;
    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    let choice: QvacChoice;
    try { choice = JSON.parse(content) as QvacChoice; } catch { return null; }
    if (!Array.isArray(choice.itemIds)) return null;
    const selectedIds = choice.itemIds.filter((value): value is string => typeof value === "string" && allowedIds.includes(value));
    if (selectedIds.length === 0 || selectedIds.length !== choice.itemIds.length) return null;
    const selected = selectedIds.map((id) => grounded.items.find((item) => item.id === id)).filter((item): item is MenuItem => Boolean(item));
    return {
      engine: "QVAC_LOCAL" as const,
      title: grounded.title,
      message: `Según tu consulta, te recomiendo ${selected.map((item) => item.name).join(", ")}.`,
      items: selected,
      note: `Selección generada localmente con QVAC (${model}) y validada contra IDs reales del menú.`,
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

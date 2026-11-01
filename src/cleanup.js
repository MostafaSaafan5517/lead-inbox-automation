// Shared cleanup logic for the n8n Code node and the unit tests.
// No imports on purpose: scripts/build-n8n-code.mjs pastes this file into n8n as is.

export const MAX_BODY_LENGTH = 4000;
export const CATEGORIES = ["hot_lead", "cold_lead", "support", "spam"];
export const URGENCIES = ["high", "normal", "low"];

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function normalizeInput(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const subject = cleanText(input.subject) ?? "";
  const body = (cleanText(input.body) ?? "").slice(0, MAX_BODY_LENGTH);
  if (!subject && !body) {
    return { ok: false, error: "Message has no subject and no body", stage: "normalize" };
  }

  const source = input.source === "email" ? "email" : "form";
  const messageId =
    cleanText(input.message_id) ??
    (source === "form" ? `form-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : null);
  if (!messageId) {
    return { ok: false, error: "Email message has no message_id", stage: "normalize" };
  }

  return {
    ok: true,
    message: {
      source,
      message_id: messageId,
      from_name: cleanText(input.from_name),
      from_email: cleanText(input.from_email)?.toLowerCase() ?? null,
      subject,
      body,
      received_at: cleanText(input.received_at) ?? new Date().toISOString(),
    },
  };
}

// "Hot Lead", "hot-lead", "HOT" and "lead (hot)" all map to "hot_lead".
export function normalizeCategory(value) {
  const key = String(value ?? "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
  if (CATEGORIES.includes(key.replace(/ /g, "_"))) return key.replace(/ /g, "_");
  if (/\bhot\b/.test(key)) return "hot_lead";
  if (/\bcold\b/.test(key)) return "cold_lead";
  if (/\bsupport\b|\bhelp\b/.test(key)) return "support";
  if (/\bspam\b|\bjunk\b/.test(key)) return "spam";
  return null;
}

function extractJson(text) {
  const unfenced = text.replace(/```(?:json)?/gi, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  return start === -1 || end < start ? null : unfenced.slice(start, end + 1);
}

export function cleanAiOutput(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return { ok: false, error: "AI output is empty", stage: "parse" };
  }

  const jsonText = extractJson(text);
  if (!jsonText) {
    return { ok: false, error: "No JSON object found in AI output", stage: "parse" };
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (parseError) {
    return { ok: false, error: `Invalid JSON: ${parseError.message}`, stage: "parse" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "AI output is not a JSON object", stage: "parse" };
  }

  const category = normalizeCategory(parsed.category);
  if (!category) {
    return { ok: false, error: `Unknown category: ${JSON.stringify(parsed.category)}`, stage: "validate" };
  }

  const confidence = Number(parsed.confidence);
  const urgency = String(parsed.urgency ?? "").trim().toLowerCase();
  const lead = {
    category,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    name: cleanText(parsed.name),
    company: cleanText(parsed.company),
    budget: cleanText(parsed.budget),
    need: cleanText(parsed.need),
    urgency: URGENCIES.includes(urgency) ? urgency : "normal",
    reply_draft: category === "spam" ? null : cleanText(parsed.reply_draft),
    reason: cleanText(parsed.reason) ?? "No reason given",
  };

  if (category !== "spam" && !lead.reply_draft) {
    return { ok: false, error: "reply_draft is required for non-spam messages", stage: "validate" };
  }

  return { ok: true, lead };
}

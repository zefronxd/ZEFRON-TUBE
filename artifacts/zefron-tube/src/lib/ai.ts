const POLLINATIONS_URL = "https://gen.pollinations.ai/v1/chat/completions";
const POLLINATIONS_MODEL = "mistral";

function buildKeywordFallbackFromTitles(titles: string[]): string[] {
  const cleaned = titles.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  const phrases = new Set<string>();
  for (const title of cleaned) {
    phrases.add(title);
    const primary = title.split(/\s[-|–—]\s/)[0]?.replace(/[\[\](){}]/g, " ").replace(/\s+/g, " ").trim();
    if (primary && primary.length >= 3) phrases.add(primary);
    const compact = title
      .replace(/official|video|lyrics|playlist|song|songs|music|full|best/gi, " ")
      .replace(/[\[\](){}|]/g, " ").replace(/\s+/g, " ").trim();
    if (compact && compact.length >= 3) phrases.add(compact);
  }
  return Array.from(phrases).map((p) => p.slice(0, 80).trim()).filter((p) => p.length >= 3).slice(0, 6);
}

function parseKeywordsFromText(content: string): string[] {
  const trimmed = content.trim();
  const tryJson = (raw: string): string[] | null => {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((s: unknown): s is string => typeof s === "string");
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as { keywords?: unknown }).keywords)) {
        return (parsed as { keywords: unknown[] }).keywords.filter((s): s is string => typeof s === "string");
      }
    } catch { /* ignore */ }
    return null;
  };
  const direct = tryJson(trimmed);
  if (direct && direct.length > 0) return cleanList(direct);
  const arrMatch = trimmed.match(/\[[\s\S]*?\]/);
  if (arrMatch) { const r = tryJson(arrMatch[0]); if (r && r.length > 0) return cleanList(r); }
  const objMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objMatch) { const r = tryJson(objMatch[0]); if (r && r.length > 0) return cleanList(r); }
  const lines = trimmed
    .split(/[\n,]/)
    .map((s) => s.replace(/^[\s\d.\-*•"'`]+/, "").replace(/["'`]+$/, "").trim())
    .filter((s) => s.length >= 3 && s.length <= 80 && !/^[\d.\s]*$/.test(s));
  return cleanList(lines);
}

function cleanList(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const v = raw.replace(/^["'`]+|["'`]+$/g, "").trim();
    if (v.length < 3 || v.length > 80) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

async function callPollinationsOnce(systemPrompt: string, userPrompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(POLLINATIONS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        model: POLLINATIONS_MODEL,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`AI error ${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : "";
  } finally {
    clearTimeout(timeout);
  }
}

async function callAIForKeywords(systemPrompt: string, userPrompt: string): Promise<string[]> {
  const sys = `${systemPrompt}\n\nIMPORTANT: Respond ONLY with a JSON array of strings, no prose, no code fences. Example: ["phrase one","phrase two"]`;
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await callPollinationsOnce(sys, userPrompt);
      const keywords = parseKeywordsFromText(text);
      if (keywords.length > 0) return keywords;
      lastErr = new Error("Empty AI response");
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

export async function generateRelatedKeywords(opts: { data: { title: string; channel?: string } }): Promise<{ keywords: string[]; error: string | null }> {
  try {
    const keywords = await callAIForKeywords(
      "You suggest related YouTube searches. CRITICAL: ALWAYS match the language, script, region, and cultural context of the input title. Return 4 short, varied phrases (2–5 words). Mix close-related and tangential picks within the same language/genre.",
      `Title: ${opts.data.title}\nChannel: ${opts.data.channel || "unknown"}\n\nReturn 4 related YouTube search phrases in the SAME language as the title.`,
    );
    return { keywords: keywords.slice(0, 4), error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const words = opts.data.title.replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 3).slice(0, 3);
    const fallback = [opts.data.title.slice(0, 40), opts.data.channel || "music", words.join(" ")].filter(Boolean);
    return { keywords: fallback, error: msg };
  }
}

export async function generateBecauseYouWatched(opts: {
  data: { recentTitles: string[]; likedTitles?: string[]; language?: string; region?: string };
}): Promise<{ keywords: string[]; error: string | null }> {
  const { recentTitles, likedTitles = [], language, region } = opts.data;
  if (recentTitles.length === 0 && likedTitles.length === 0) return { keywords: [], error: null };
  const fallback = buildKeywordFallbackFromTitles([...likedTitles, ...recentTitles]);
  const langHint = language && language !== "global" && language !== "en"
    ? `\n\nUSER REGION: ${region || "unknown"}\nPREFERRED LANGUAGE: ${language}\nIMPORTANT: Bias ~60% of phrases toward this language/region. Keep ~40% global.`
    : "";
  try {
    const keywords = await callAIForKeywords(
      "You generate YouTube search phrases that match a user's taste. CRITICAL: ALWAYS match the language and culture of the input titles. Return diverse, specific phrases (2–5 words each).",
      `LIKED (high signal):\n${likedTitles.length === 0 ? "(none)" : likedTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\nWATCHED (medium signal):\n${recentTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}${langHint}\n\nReturn 6 YouTube search phrases.`,
    );
    return { keywords: (keywords.length > 0 ? keywords : fallback).slice(0, 6), error: null };
  } catch (e) {
    return { keywords: fallback, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function generateTrendingNow(opts: {
  data: { hint?: string; language?: string; region?: string };
}): Promise<{ keywords: string[]; error: string | null }> {
  const { hint, language, region } = opts.data;
  try {
    const seed = Math.floor(Math.random() * 100000);
    const langHint = language && language !== "global" && language !== "en"
      ? `\nUSER REGION: ${region || "unknown"} — bias ~60% trends toward ${language}. Keep ~40% global hits.`
      : "";
    const keywords = await callAIForKeywords(
      "You suggest currently popular YouTube search phrases people would want to watch right now. Mix music drops, viral clips, popular creators, sports highlights, gaming, tech news. Each phrase: 2–5 words. No duplicates.",
      `Hint about user taste: ${hint || "general audience"}${langHint}\nSeed: ${seed}\n\nReturn 5 trending YouTube search phrases.`,
    );
    return { keywords: keywords.slice(0, 5), error: null };
  } catch (e) {
    return { keywords: [], error: e instanceof Error ? e.message : "Unknown error" };
  }
}

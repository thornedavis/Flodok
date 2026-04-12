const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPTS = {
  'en-to-id': `You are a professional English-to-Indonesian translator specializing in workplace documentation.

Translate the provided Standard Operating Procedure (SOP) content from English to Bahasa Indonesia.

Rules:
- Maintain all markdown formatting (headings, lists, bold, etc.)
- Keep proper nouns, brand names, and technical terms that are commonly used in English as-is
- Use formal Bahasa Indonesia appropriate for workplace documentation
- Preserve the exact structure and organization of the original
- Do not add, remove, or interpret content — translate only

Return ONLY the translated markdown text, no JSON wrapper, no explanation.`,

  'id-to-en': `You are a professional Indonesian-to-English translator specializing in workplace documentation.

Translate the provided Standard Operating Procedure (SOP) content from Bahasa Indonesia to English.

Rules:
- Maintain all markdown formatting (headings, lists, bold, etc.)
- Keep proper nouns, brand names, and technical terms as-is
- Use clear, professional English appropriate for workplace documentation
- Preserve the exact structure and organization of the original
- Do not add, remove, or interpret content — translate only

Return ONLY the translated markdown text, no JSON wrapper, no explanation.`,
};

export type TranslationDirection = 'en-to-id' | 'id-to-en';

/**
 * Translates SOP content between English and Indonesian using OpenRouter.
 * Returns { text, error } — text is the translation, error is the failure reason.
 */
export async function translateSOP(
  content: string,
  direction: TranslationDirection = 'en-to-id',
): Promise<{ text: string | null; error: string | null }> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  const model = Deno.env.get("OPENROUTER_TRANSLATION_MODEL") || "openai/gpt-5.4-nano";

  if (!apiKey) {
    return { text: null, error: "OPENROUTER_API_KEY not set" };
  }

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://flodok.com",
        "X-Title": "Flodok SOP Translation",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPTS[direction] },
          { role: "user", content },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`OpenRouter translation failed: ${response.status}`, body);
      return { text: null, error: `OpenRouter returned ${response.status}: ${body}` };
    }

    const json = await response.json() as {
      choices: { message: { content: string } }[];
    };

    const result = json.choices?.[0]?.message?.content;
    if (!result) {
      return { text: null, error: "No content in OpenRouter response" };
    }

    return { text: result, error: null };
  } catch (err) {
    console.error("Translation error:", err);
    return { text: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// Backwards-compatible alias
export const translateToIndonesian = (content: string) => translateSOP(content, 'en-to-id');

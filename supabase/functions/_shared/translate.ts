const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const TRANSLATION_SYSTEM_PROMPT = `You are a professional English-to-Indonesian translator specializing in workplace documentation.

Translate the provided Standard Operating Procedure (SOP) content from English to Bahasa Indonesia.

Rules:
- Maintain all markdown formatting (headings, lists, bold, etc.)
- Keep proper nouns, brand names, and technical terms that are commonly used in English as-is
- Use formal Bahasa Indonesia appropriate for workplace documentation
- Preserve the exact structure and organization of the original
- Do not add, remove, or interpret content — translate only

Return ONLY the translated markdown text, no JSON wrapper, no explanation.`;

/**
 * Translates English markdown content to Indonesian using OpenRouter.
 * Returns the translated text, or null if translation fails.
 */
export async function translateToIndonesian(
  englishContent: string,
): Promise<string | null> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  const model = Deno.env.get("OPENROUTER_MODEL") || "moonshotai/kimi-k2.5";

  if (!apiKey) {
    console.error("OPENROUTER_API_KEY not set, skipping translation");
    return null;
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
          { role: "system", content: TRANSLATION_SYSTEM_PROMPT },
          { role: "user", content: englishContent },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error(`OpenRouter translation failed: ${response.status}`);
      return null;
    }

    const json = await response.json() as {
      choices: { message: { content: string } }[];
    };

    return json.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("Translation error:", err);
    return null;
  }
}

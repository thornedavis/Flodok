const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function callLLM(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  model: string,
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 2000));
    }

    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://flodok.com",
          "X-Title": "Flodok Router",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `OpenRouter API returned ${response.status}: ${await response.text()}`,
        );
      }

      const json = (await response.json()) as {
        choices: { message: { content: string } }[];
      };

      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("No content in LLM response");
      }

      return content;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(`LLM call failed after 2 attempts: ${lastError?.message}`);
}

export function parseLLMJson<T>(raw: string): T {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return JSON.parse(cleaned) as T;
}

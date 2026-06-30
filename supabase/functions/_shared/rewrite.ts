// Shared text-rewrite helper for the editor's selection bubble menu.
//
// Stateless text-in / text-out, like translate.ts, but for the
// "Improve writing", "Proofread", and "Explain" actions. The model is
// asked to operate in the SAME language as the input (the editor is
// bilingual; we never want an action to silently switch languages).
//
// improve / proofread return a replacement for the selection.
// explain returns commentary that the UI shows separately — it must
// never replace the source text.

import { extractUsage, logAiUsage } from './logUsage.ts'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

export type RewriteAction = 'improve' | 'proofread' | 'explain'

export const REWRITE_ACTIONS: RewriteAction[] = ['improve', 'proofread', 'explain']

const SYSTEM_PROMPTS: Record<RewriteAction, string> = {
  improve: `You are an editor improving workplace and legal document text.

Rewrite the provided text to be clearer, tighter, and more professional, WITHOUT changing its meaning or legal effect.

Rules:
- Respond in the SAME language as the input (English or Bahasa Indonesia).
- Preserve any markdown/inline formatting present.
- Do not add new facts, clauses, numbers, or commitments.
- Return ONLY the rewritten text — no preamble, no explanation, no quotes.`,

  proofread: `You are a proofreader for workplace and legal documents.

Correct grammar, spelling, and punctuation in the provided text. Make the minimum changes necessary — do not rephrase for style.

Rules:
- Respond in the SAME language as the input (English or Bahasa Indonesia).
- Preserve meaning, formatting, and structure exactly.
- Return ONLY the corrected text — no preamble, no explanation, no quotes.`,

  explain: `You are a helpful assistant explaining workplace and legal document text.

Explain the provided text in plain, simple terms so a non-expert understands what it means and why it matters.

Rules:
- Respond in the SAME language as the input (English or Bahasa Indonesia).
- Be concise — a short paragraph.
- Return ONLY the explanation.`,
}

export function isRewriteAction(value: unknown): value is RewriteAction {
  return typeof value === 'string' && (REWRITE_ACTIONS as string[]).includes(value)
}

export async function rewriteText(
  text: string,
  action: RewriteAction,
  // When provided, token + cost usage is logged to ai_usage under this context.
  logCtx?: { functionName: string; orgId?: string | null; calledBy?: string | null },
): Promise<{ text: string | null; error: string | null }> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  const model = Deno.env.get('OPENROUTER_REWRITE_MODEL')
    || Deno.env.get('OPENROUTER_TRANSLATION_MODEL')
    || 'openai/gpt-5.4-nano'

  if (!apiKey) return { text: null, error: 'OPENROUTER_API_KEY not set' }

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://flodok.com',
        'X-Title': 'Flodok Editor AI',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS[action] },
          { role: 'user', content: text },
        ],
        // Proofread/improve want low creativity; explain a touch more.
        temperature: action === 'explain' ? 0.4 : 0.2,
        usage: { include: true },
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`OpenRouter rewrite failed: ${response.status}`, body)
      return { text: null, error: `OpenRouter returned ${response.status}` }
    }

    const json = await response.json() as { choices: { message: { content: string } }[]; usage?: unknown }
    const result = json.choices?.[0]?.message?.content
    if (!result) return { text: null, error: 'No content in OpenRouter response' }
    if (logCtx) {
      await logAiUsage({ ...logCtx, model, usage: extractUsage(json) })
    }
    return { text: result, error: null }
  } catch (err) {
    console.error('Rewrite error:', err)
    return { text: null, error: err instanceof Error ? err.message : String(err) }
  }
}

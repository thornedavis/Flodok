import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/auth.ts'

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

const SYSTEM_PROMPT = `You are an expert SOP (Standard Operating Procedure) writer for workplace documentation.

You either generate new SOPs or revise existing ones based on the user's instructions.

When creating a new SOP:
- Structure logically: Overview/Purpose, Responsibilities, Procedures/Steps, Important Notes
- Be specific and actionable — each step should be clear enough for someone new to follow

When revising an existing SOP:
- Apply the user's requested changes to the existing content
- Preserve sections and content the user did not ask to change
- Return the complete revised SOP, not just the changed parts

Rules for all responses:
- Use clear markdown formatting: headings (#, ##, ###), bullet lists, numbered steps, bold for emphasis
- Use professional but accessible language
- Tailor the content to the employee's role and department if provided
- Keep it practical and relevant to day-to-day operations
- Do not include meta-commentary or explanations — output ONLY the SOP markdown content`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { prompt, employee_name, department, title, existing_content, system_prompt } = await req.json()
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Missing required field: prompt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get("OPENROUTER_API_KEY")
    const model = Deno.env.get("OPENROUTER_GENERATION_MODEL") || "google/gemini-3-flash-preview"

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY not set' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build context-aware user message
    let userMessage = ''
    if (employee_name || department || title) {
      userMessage += 'Context:\n'
      if (employee_name) userMessage += `- Employee: ${employee_name}\n`
      if (department) userMessage += `- Department: ${department}\n`
      if (title) userMessage += `- SOP Title: ${title}\n`
      userMessage += '\n'
    }

    if (existing_content) {
      userMessage += `Current SOP content (to refine/expand):\n${existing_content}\n\n`
    }

    userMessage += `Request: ${prompt}`

    // Call OpenRouter with streaming
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://flodok.com",
        "X-Title": "Flodok SOP Generation",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system_prompt || SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        stream: true,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`OpenRouter generation failed: ${response.status}`, body)
      return new Response(JSON.stringify({ error: `OpenRouter returned ${response.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Stream the response through to the client
    const reader = response.body!.getReader()
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        const decoder = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            controller.close()
            break
          }
          controller.enqueue(value)
        }
      },
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err) {
    console.error('generate-sop error:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

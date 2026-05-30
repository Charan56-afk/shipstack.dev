import fs from 'fs';
import path from 'path';

export async function POST(req) {
  const logPath = path.join(process.cwd(), 'compiler_api.log');
  const log = (msg) => {
    try {
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`, 'utf8');
    } catch (e) {
      console.error('Failed to write to compiler_api.log:', e.message);
    }
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Parse the "try again in Xs" from a Groq 429 error body
  const parseRetryAfterMs = (errBody) => {
    try {
      const obj = JSON.parse(errBody);
      const msg = obj?.error?.message || '';
      const match = msg.match(/try again in ([0-9.]+)s/i) || msg.match(/try again in ([0-9]+)m([0-9.]+)s/i);
      if (match && match.length === 2) return Math.ceil(parseFloat(match[1]) * 1000) + 500;
      if (match && match.length === 3) return Math.ceil((parseFloat(match[1]) * 60 + parseFloat(match[2])) * 1000) + 500;
    } catch {}
    return 5000; // default 5s wait
  };

  try {
    const body = await req.json();
    log(`--- NEW COMPILE REQUEST ---`);
    log(`System message length: ${body.system?.length || 0}`);
    log(`User messages count: ${body.messages?.length || 0}`);
    if (body.messages && body.messages.length > 0) {
      log(`Last user message preview: ${body.messages[body.messages.length - 1].content?.slice(0, 200)}...`);
    }

    // Use Groq if the key is available
    if (process.env.GROQ_API_KEY) {
      log(`Routing to Groq...`);
      const groqMessages = [];
      if (body.system) {
        groqMessages.push({ role: 'system', content: body.system });
      }
      if (body.messages) {
        groqMessages.push(...body.messages);
      }

      const runWithModel = async (modelName) => {
        const groqRequestBody = {
          model: modelName,
          messages: groqMessages,
          max_tokens: body.max_tokens || 4000,
          temperature: 0.1,
        };
        return await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          },
          body: JSON.stringify(groqRequestBody),
        });
      };

      // Model cascade strategy:
      // - Start with llama-3.1-8b-instant (30,000 TPM free limit — 2.5x higher than 70B)
      // - Escalate to llama-3.3-70b-versatile only if 8b is also rate-limited
      // - Parse actual retry-after time from 429 response and wait precisely
      const MODEL_8B = 'llama-3.1-8b-instant';
      const MODEL_70B = 'llama-3.3-70b-versatile';

      let response = await runWithModel(MODEL_8B);

      if (response.status === 429) {
        const errBody = await response.text();
        const waitMs = parseRetryAfterMs(errBody);
        log(`8B model rate limited (429). Waiting ${waitMs}ms as instructed by Groq...`);
        await sleep(waitMs);
        response = await runWithModel(MODEL_8B);
      }

      if (response.status === 429) {
        log(`8B model still rate limited. Trying 70B model...`);
        response = await runWithModel(MODEL_70B);
      }

      if (response.status === 429) {
        const errBody = await response.text();
        const waitMs = parseRetryAfterMs(errBody);
        log(`70B model rate limited (429). Waiting ${waitMs}ms...`);
        await sleep(waitMs);
        response = await runWithModel(MODEL_70B);
      }

      if (response.status === 429) {
        const errBody = await response.text();
        log(`All models rate limited. Last error: ${errBody}`);
        return Response.json(
          {
            error:
              'The AI service is temporarily rate-limited due to free tier limits (100K tokens/day). Please wait 1–2 minutes and try again, or try a simpler app description.',
          },
          { status: 429 }
        );
      }

      if (!response.ok) {
        const err = await response.text();
        log(`Groq API error! Status: ${response.status}. Error body: ${err}`);
        return Response.json({ error: err }, { status: response.status });
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      log(`Groq response received! Status: 200. Text length: ${text.length}`);

      // Format response to match Anthropic Messages structure for the client
      return Response.json({
        content: [{ type: 'text', text }],
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      log(`No API key found. Set GROQ_API_KEY or ANTHROPIC_API_KEY in your environment.`);
      return Response.json(
        {
          error:
            'No AI API key configured. Please set the GROQ_API_KEY environment variable in your Render dashboard (Environment → Add Environment Variable).',
        },
        { status: 500 }
      );
    }

    log(`Routing to Anthropic...`);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      log(`Anthropic API error! Status: ${response.status}. Error: ${err}`);
      return Response.json({ error: err }, { status: response.status });
    }

    const data = await response.json();
    log(`Anthropic response received! Status: 200.`);
    return Response.json(data);
  } catch (err) {
    log(`Exception in POST: ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

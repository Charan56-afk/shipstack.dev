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

  try {
    const body = await req.json();
    log(`--- NEW COMPILE REQUEST ---`);
    log(`System message length: ${body.system?.length || 0}`);
    log(`User messages count: ${body.messages?.length || 0}`);
    if (body.messages && body.messages.length > 0) {
      log(`Last user message preview: ${body.messages[body.messages.length - 1].content?.slice(0, 200)}...`);
    }

    // Use Groq if the key is available (since the user's Anthropic key lacks credits)
    if (process.env.GROQ_API_KEY) {
      log(`Routing to Groq...`);
      const groqMessages = [];
      if (body.system) {
        groqMessages.push({ role: "system", content: body.system });
      }
      if (body.messages) {
        groqMessages.push(...body.messages);
      }

      const runWithModel = async (modelName) => {
        const groqRequestBody = {
          model: modelName,
          messages: groqMessages,
          max_tokens: body.max_tokens || 4000,
          temperature: 0.1
        };

        return await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
          },
          body: JSON.stringify(groqRequestBody),
        });
      };

      // 1. Try with the high-quality 70B model first
      let response = await runWithModel("llama-3.3-70b-versatile");

      // 2. If rate limited, fall back immediately to the 8B model (which has a 30,000 TPM limit)
      if (response.status === 429) {
        log(`[Compiler API] 70B model rate limited (429). Falling back to llama-3.1-8b-instant...`);
        response = await runWithModel("llama-3.1-8b-instant");
      }

      // 3. If still rate limited, wait a moment and retry with the 8B model
      if (response.status === 429) {
        log(`[Compiler API] 8B model rate limited. Waiting 3000ms...`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        response = await runWithModel("llama-3.1-8b-instant");
      }

      // 4. If still rate limited, wait a bit longer and try one final time
      if (response.status === 429) {
        log(`[Compiler API] 8B model still rate limited. Waiting 6000ms...`);
        await new Promise((resolve) => setTimeout(resolve, 6000));
        response = await runWithModel("llama-3.1-8b-instant");
      }

      if (!response.ok) {
        const err = await response.text();
        log(`Groq API error! Status: ${response.status}. Error body: ${err}`);
        return Response.json({ error: err }, { status: response.status });
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "";
      log(`Groq response received! Status: 200. Text length: ${text.length}`);

      // Format response to look like Anthropic's Messages response structure for the client
      const formattedResponse = {
        content: [
          {
            type: "text",
            text: text
          }
        ]
      };

      return Response.json(formattedResponse);
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      log(`No API key found. Set GROQ_API_KEY or ANTHROPIC_API_KEY in your environment.`);
      return Response.json(
        { error: "No AI API key configured. Please set the GROQ_API_KEY environment variable in your Render dashboard (Environment → Add Environment Variable)." },
        { status: 500 }
      );
    }

    log(`Routing to Anthropic...`);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
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

import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { env } from '@/lib/env';
import { callMap } from '@/lib/tools';
import { asApiError } from '@/lib/errors';

/**
 * POST handler for the chat API
 */
export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages) || !messages.length) {
      return asApiError('messages[] missing', 400);
    }

    const system = {
      role: 'system',
      content:
        'You are a travel-cost agent. Extract city, category, start, end, pax; ' +
        'call the proper tool; then summarise results.'
    };

    const chat = [system, ...messages];
    // Format the tool schemas correctly for the OpenAI API
    const schemas = Object.values(callMap).map(t => ({
      type: 'function' as const,
      function: {
        name: t.schema.name,
        description: t.schema.description,
        parameters: t.schema.parameters
      }
    }));

    const ai = await openai.chat.completions.create({
      model: env.OPENAI_DEPLOYMENT,
      messages: chat,
      tools: schemas,
      tool_choice: 'auto',
    });

    const msg = ai.choices[0].message;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const toolCall = msg.tool_calls[0];
      const { function: fnCall } = toolCall;
      const { name, arguments: raw } = fnCall;
      
      const args = JSON.parse(raw || '{}');
      const tool = callMap[name as keyof typeof callMap];
      if (!tool) return asApiError(`Unknown tool ${name}`, 400);

      const result = await tool.run(args);
      chat.push(msg);
      chat.push({ 
        role: 'tool', 
        tool_call_id: toolCall.id,
        name, 
        content: JSON.stringify(result) 
      });

      const final = await openai.chat.completions.create({
        model: env.OPENAI_DEPLOYMENT,
        messages: chat,
      });

      return NextResponse.json(final.choices[0].message);
    }

    return NextResponse.json(msg);
  } catch (err: any) {
    console.error(err);
    return asApiError('Internal error', 500, err.message);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const model = String(body?.model || '');
    const input = body?.input;
    const temperature = Number(body?.temperature ?? 0.2);
    const max_output_tokens = Number(body?.max_output_tokens ?? 500);

    if (!model) {
      return NextResponse.json({ error: 'model_required' }, { status: 400 });
    }
    if (model.startsWith('gpt-realtime-')) {
      return NextResponse.json(
        {
          error: 'unsupported_model',
          details: 'Realtime models are not supported in Responses API.',
        },
        { status: 400 },
      );
    }
    if (!Array.isArray(input)) {
      return NextResponse.json({ error: 'input_required' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const stream = await openai.responses.create({
      model,
      input,
      temperature,
      max_output_tokens,
      stream: true,
    });

    let text = '';
    for await (const event of stream) {
      const ev: any = event as any;
      const type = ev?.type || '';
      if (type === 'response.output_text.delta') {
        text += ev.delta || '';
      }
      if (type === 'response.output_text') {
        text += ev.text || '';
      }
    }

    return NextResponse.json({ ok: true, text: text.trim() });
  } catch (err: any) {
    console.error('[ABIC Rewrite] error', err);
    return NextResponse.json(
      { error: 'failed', details: err?.message ? String(err.message) : String(err) },
      { status: 500 },
    );
  }
}


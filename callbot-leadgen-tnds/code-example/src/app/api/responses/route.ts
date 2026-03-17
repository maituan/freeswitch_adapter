import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

function resolveResponsesBody(body: any) {
  const { useClassifierModel, ...rest } = body ?? {};
  const explicitModel = String(rest?.model ?? '').trim();

  if (explicitModel) {
    return {
      ...rest,
      model: explicitModel,
    };
  }

  const envModel = useClassifierModel
    ? String(process.env.OPENAI_CLASSIFIER_MODEL ?? '').trim()
    : '';

  return {
    ...rest,
    model: envModel || 'gpt-4o-mini',
  };
}

// Proxy endpoint for the OpenAI Responses API
export async function POST(req: NextRequest) {
  const body = await req.json();
  const resolvedBody = resolveResponsesBody(body);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  if (resolvedBody.text?.format?.type === 'json_schema') {
    return await structuredResponse(openai, resolvedBody);
  } else {
    return await textResponse(openai, resolvedBody);
  }
}

async function structuredResponse(openai: OpenAI, body: any) {
  try {
    const response = await openai.responses.parse({
      ...(body as any),
      stream: false,
    });

    return NextResponse.json(response);
  } catch (err: any) {
    console.error('responses proxy error', err);
    return NextResponse.json({ error: 'failed' }, { status: 500 }); 
  }
}

async function textResponse(openai: OpenAI, body: any) {
  try {
    const response = await openai.responses.create({
      ...(body as any),
      stream: false,
    });

    return NextResponse.json(response);
  } catch (err: any) {
    console.error('responses proxy error', err);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
  
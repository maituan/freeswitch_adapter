import { NextRequest, NextResponse } from 'next/server';
import { readKbItems, seedIfEmpty } from '@/app/lib/kbReader';
import { tndsFaqItems } from '@/app/agentConfigs/leadgenTNDS/faqData';

export const runtime = 'nodejs';

type FaqItem = {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  category: string;
};

function normalizeForLookup(text: string) {
  return String(text || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadFaqItems(): Promise<FaqItem[]> {
  await seedIfEmpty('leadgenTNDS', 'faq', tndsFaqItems as Array<{ id: string; [k: string]: unknown }>);
  const items = await readKbItems<FaqItem>('leadgenTNDS', 'faq');
  return items.length ? items : (tndsFaqItems as FaqItem[]);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question = String(body?.question ?? '');
    if (!question.trim()) {
      return NextResponse.json({ error: 'question_required' }, { status: 400 });
    }

    const items = await loadFaqItems();
    const q = normalizeForLookup(question);

    // Fast-path: "which insurance company"
    const isCompanyQuestion =
      q.includes('bao hiem nao') ||
      q.includes('ben bao hiem nao') ||
      q.includes('em o ben bao hiem nao');
    if (isCompanyQuestion) {
      const company = items.find((it) => it.id === 'faq-company-name');
      if (company) return NextResponse.json({ found: true, faq: company });
    }

    // Fast-path: "about us / where are you"
    const isWhereQuestion =
      q.includes('em o dau') ||
      q.includes('em ben nao') ||
      q.includes('ben nao') ||
      q.includes('em la ai') ||
      q.includes('bao hiem gi');
    if (isWhereQuestion) {
      const about = items.find((it) => it.id === 'faq-where');
      if (about) return NextResponse.json({ found: true, faq: about });
    }

    // Exact match
    const exact = items.find((it) => {
      const iq = normalizeForLookup(it.question);
      return q.includes(iq) || iq.includes(q);
    });
    if (exact) return NextResponse.json({ found: true, faq: exact });

    // Keyword scoring
    const scored = items.map((it) => {
      let score = 0;
      for (const kw of it.keywords) {
        const nkw = normalizeForLookup(kw);
        if (nkw && q.includes(nkw)) score += 2;
      }
      const cat = normalizeForLookup(it.category);
      if (cat && q.includes(cat)) score += 1;
      return { it, score };
    });
    const best = scored.sort((a, b) => b.score - a.score)[0];
    if (best && best.score > 0) {
      return NextResponse.json({ found: true, faq: best.it });
    }

    return NextResponse.json({
      found: false,
      message: 'Xin loi, em chua tim thay thong tin phu hop. Anh/chi co the hoi cu the hon duoc khong a?',
    });
  } catch (err: any) {
    console.error('[LeadGen FAQ Search] error', err);
    return NextResponse.json(
      { error: 'failed', details: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}

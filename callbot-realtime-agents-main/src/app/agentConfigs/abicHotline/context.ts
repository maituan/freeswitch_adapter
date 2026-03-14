export type AbicHotlineContext = {
  agentConfig: string;
  sessionId: string;
};

let ctx: AbicHotlineContext = {
  agentConfig: 'abicHotline',
  sessionId: '',
};

export function setAbicHotlineContext(next: Partial<AbicHotlineContext>) {
  ctx = { ...ctx, ...next };
}

export function getAbicHotlineContext(): AbicHotlineContext {
  return ctx;
}


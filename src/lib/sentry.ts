export type SentryClient = typeof import('@sentry/react');

export async function initSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  const Sentry = (await import('@sentry/react')) as unknown as SentryClient;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: __APP_VERSION__,
    tracesSampleRate: 0,
  });

  try {
    const { buildDebugReport } = await import('./debug');
    Sentry.setContext('app_debug', buildDebugReport());
  } catch {
    // ignore
  }
}

export async function captureException(error: unknown, context?: Record<string, unknown>): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  const Sentry = (await import('@sentry/react')) as unknown as SentryClient;

  const debugReport = await (async () => {
    try {
      const { buildDebugReport } = await import('./debug');
      return buildDebugReport();
    } catch {
      return null;
    }
  })();

  Sentry.withScope((scope) => {
    if (debugReport) scope.setContext('app_debug', debugReport);
    const phase = context?.phase;
    if (typeof phase === 'string' && phase.trim()) scope.setTag('phase', phase);
    const reason = context?.reason;
    if (typeof reason === 'string' && reason.trim()) scope.setTag('reason', reason);
    if (context && Object.keys(context).length) {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
    }
    Sentry.captureException(error);
  });
}

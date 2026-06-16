const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  // eslint-disable-next-line no-console
  error: (message: string, error?: unknown) => { if (isDev) console.error(`[ERROR] ${message}`, error ?? ''); },
  // eslint-disable-next-line no-console
  warn: (message: string, data?: unknown) => { if (isDev) console.warn(`[WARN] ${message}`, data ?? ''); },
  // eslint-disable-next-line no-console
  info: (message: string, data?: unknown) => { if (isDev) console.info(`[INFO] ${message}`, data ?? ''); },
};

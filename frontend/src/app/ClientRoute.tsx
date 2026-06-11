'use client';

import { Suspense, type ReactNode } from 'react';

export default function ClientRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

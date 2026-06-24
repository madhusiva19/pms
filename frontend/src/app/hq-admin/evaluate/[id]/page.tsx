'use client';

import dynamic from 'next/dynamic';
import ClientRoute from '@/app/ClientRoute';

const EvaluateMember = dynamic(() => import('@/components/evaluation/EvaluateMemberPage'), { ssr: false });

export default function EvaluateMemberRoute() {
  return <ClientRoute><EvaluateMember /></ClientRoute>;
}

'use client';

import TestConnection from '@/app/_shared/TestConnectionView';
import ClientRoute from '@/app/ClientRoute';

export default function TestConnectionRoute() {
  return <ClientRoute><TestConnection /></ClientRoute>;
}

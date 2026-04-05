'use client';

import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '20px' }}>Welcome to PMS</h1>
      <p style={{ fontSize: '16px', marginBottom: '30px', color: '#666' }}>
        Performance Management System
      </p>
      <button
        onClick={() => router.push('/my-team')}
        style={{
          padding: '12px 24px',
          fontSize: '16px',
          backgroundColor: '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        Go to My Team
      </button>
    </div>
  );
}

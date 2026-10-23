'use client';

import React from 'react';

import Foreman from '@/components/foreman/Foreman';
import Sidebar from '@/components/Sidebar';
import { C } from '@/components/ui';
import { KeenFloProvider, useKeenFlo } from '@/lib/use-keenflo';

function WriteErrorBanner() {
  const { writeError } = useKeenFlo();
  if (!writeError) return null;
  return (
    <div
      role="alert"
      style={{
        background: 'rgba(229, 62, 62, 0.08)',
        border: `1px solid ${C.red}`,
        borderRadius: 12,
        padding: '10px 16px',
        fontSize: 13,
        color: C.ink,
      }}
    >
      {writeError}
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <KeenFloProvider>
      <div
        style={{
          color: C.ink,
          background: C.page,
          minHeight: '100vh',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            minHeight: '100vh',
          }}
        >
          <Sidebar />
          <main
            style={{
              flex: '999 1 640px',
              minWidth: 0,
              boxSizing: 'border-box',
              padding: '24px 32px 48px',
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
            }}
          >
            <WriteErrorBanner />
            {children}
          </main>
        </div>
        <Foreman />
      </div>
    </KeenFloProvider>
  );
}

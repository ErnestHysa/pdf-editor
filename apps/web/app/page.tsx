'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { EmptyState } from '@/components/layout/EmptyState';

export default function HomePage() {
  const [hasFile, setHasFile] = useState(false);

  // In a real implementation this would read from the document store.
  // For now, show the empty state until a file is loaded.
  const handleFileOpen = () => setHasFile(true);

  return (
    <AppShell>
      {!hasFile ? <EmptyState onOpen={handleFileOpen} /> : null}
    </AppShell>
  );
}

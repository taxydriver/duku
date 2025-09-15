import { Suspense } from 'react';
import RecsClient from './RecsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function RecsPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading…</div>}>
      <RecsClient />
    </Suspense>
  );
}
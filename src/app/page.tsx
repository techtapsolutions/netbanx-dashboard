'use client';

import { WebhookDashboard } from '@/components/WebhookDashboard';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

export default function Home() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <WebhookDashboard />
      </div>
    </ProtectedRoute>
  );
}

'use client';

import { Wrench } from 'lucide-react';
import { SystemHealthCheck } from '@/components/crm/SystemHealthCheck';

export default function MaintenancePage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-crm-primary/10 flex items-center justify-center">
          <Wrench size={20} className="text-crm-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Manutenção do Sistema</h1>
          <p className="text-sm text-txt-secondary mt-1">
            Monitore a saúde dos dados e corrija inconsistências
          </p>
        </div>
      </div>

      {/* Health Check Dashboard */}
      <SystemHealthCheck />
    </div>
  );
}

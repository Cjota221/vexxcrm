'use client';

import { useState } from 'react';
import {
  Ticket,
  Plus,
  Copy,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Percent,
  DollarSign,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate, copyToClipboard } from '@/lib/utils';
import type { Coupon } from '@/types';

// TODO: hook useCoupons
const mockCoupons: Coupon[] = [];

export default function CuponsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Cupons</h1>
          <p className="text-sm text-txt-secondary mt-1">
            Gerencie cupons de desconto para suas campanhas
          </p>
        </div>
        <Button variant="primary">
          <Plus size={16} /> Novo Cupom
        </Button>
      </div>

      {/* Lista */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockCoupons.length === 0 ? (
          <div className="col-span-full">
            <Card>
              <div className="p-8 text-center">
                <Ticket size={32} className="mx-auto text-txt-secondary mb-3" />
                <p className="text-txt-secondary">Nenhum cupom cadastrado</p>
                <p className="text-xs text-txt-muted mt-1">
                  Crie cupons para usar em campanhas de WhatsApp
                </p>
              </div>
            </Card>
          </div>
        ) : (
          mockCoupons.map((coupon) => (
            <Card key={coupon.id} padding="none">
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <code className="px-2 py-1 bg-crm-primary/10 text-crm-primary rounded text-sm font-mono font-bold">
                      {coupon.code}
                    </code>
                    <button
                      onClick={() => copyToClipboard(coupon.code)}
                      className="p-1 text-txt-secondary hover:text-crm-primary transition-colors"
                      title="Copiar código"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  <Badge variant={coupon.is_active ? 'success' : 'neutral'}>
                    {coupon.is_active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  {coupon.type === 'percentage' ? (
                    <Percent size={16} className="text-green-500" />
                  ) : (
                    <DollarSign size={16} className="text-green-500" />
                  )}
                  <span className="text-lg font-bold text-txt-primary">
                    {coupon.type === 'percentage'
                      ? `${coupon.value}%`
                      : formatCurrency(coupon.value)}
                  </span>
                </div>

                <div className="text-xs text-txt-secondary space-y-1 border-t border-surface-100 pt-2">
                  <div className="flex justify-between">
                    <span>Usos</span>
                    <span>
                      {coupon.used_count}
                      {coupon.max_uses ? ` / ${coupon.max_uses}` : ' (ilimitado)'}
                    </span>
                  </div>
                  {coupon.min_order_value && (
                    <div className="flex justify-between">
                      <span>Valor mínimo</span>
                      <span>{formatCurrency(coupon.min_order_value)}</span>
                    </div>
                  )}
                  {coupon.expires_at && (
                    <div className="flex justify-between">
                      <span>Expira em</span>
                      <span>{formatDate(coupon.expires_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

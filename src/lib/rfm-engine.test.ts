import { describe, it, expect } from 'vitest';
import { resolveSegment, RFM_CONFIG } from '@/lib/rfm-segments';

/**
 * Calcula score de recência baseado nos thresholds do RFM_CONFIG.
 */
function scoreRecency(days: number): number {
  for (const s of [5, 4, 3, 2, 1]) {
    if (days <= RFM_CONFIG.recency[s]) return s;
  }
  return 1;
}

/**
 * Calcula score de frequência baseado nos thresholds do RFM_CONFIG.
 */
function scoreFrequency(totalOrders: number): number {
  for (const s of [5, 4, 3, 2, 1]) {
    if (totalOrders >= RFM_CONFIG.frequency[s]) return s;
  }
  return 1;
}

describe('RFM Engine', () => {
  it('cliente com 3 compras nos últimos 30 dias tem score de recência 5 e frequência 3', () => {
    const r = scoreRecency(20);    // 20 dias → score 5 (≤30 dias)
    const f = scoreFrequency(3);   // 3 pedidos → score 3
    expect(r).toBe(5);
    expect(f).toBe(3);
  });

  it('cliente com alta recência E alta frequência deve ser Loyal Customer ou Champion', () => {
    // Score 455 = R4, F5, M5 → Loyal Customers (definido no mapa)
    const segment = resolveSegment('455');
    expect(['Champions', 'Loyal Customers']).toContain(segment.nome);
  });

  it('cliente com score 555 deve ser Champion', () => {
    const segment = resolveSegment('555');
    expect(segment.nome).toBe('Champions');
    expect(segment.prioridade).toBe(1);
  });

  it('cliente inativo há mais de 180 dias com 1 compra deve ser Lost', () => {
    const r = scoreRecency(200);   // 200 dias → score 1 (>180 dias)
    const f = scoreFrequency(1);   // 1 pedido → score 1
    expect(r).toBe(1);
    expect(f).toBe(1);

    const segment = resolveSegment('111');
    expect(segment.nome).toBe('Lost');
  });

  it('scoreRecency retorna 5 para clientes com compra há até 30 dias', () => {
    expect(scoreRecency(1)).toBe(5);
    expect(scoreRecency(30)).toBe(5);
    expect(scoreRecency(31)).toBe(4);
  });

  it('scoreRecency retorna 1 para clientes inativos há mais de 180 dias', () => {
    expect(scoreRecency(181)).toBe(1);
    expect(scoreRecency(365)).toBe(1);
  });

  it('scoreFrequency retorna 5 para clientes com 10+ pedidos', () => {
    expect(scoreFrequency(10)).toBe(5);
    expect(scoreFrequency(20)).toBe(5);
    expect(scoreFrequency(9)).toBe(4);
  });
});

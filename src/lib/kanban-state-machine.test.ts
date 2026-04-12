import { describe, it, expect } from 'vitest';
import { validateTransition } from '@/lib/kanban-state-machine';

describe('Kanban State Machine', () => {
  describe('transições válidas', () => {
    it('card novo (null) pode ir para PRIMEIRO_CONTATO', () => {
      const result = validateTransition(null, 'PRIMEIRO_CONTATO');
      expect(result.allowed).toBe(true);
    });

    it('PRIMEIRO_CONTATO pode ir para EM_NEGOCIACAO', () => {
      const result = validateTransition('PRIMEIRO_CONTATO', 'EM_NEGOCIACAO');
      expect(result.allowed).toBe(true);
    });

    it('EM_NEGOCIACAO pode ir para AGUARDANDO_PAGAMENTO', () => {
      const result = validateTransition('EM_NEGOCIACAO', 'AGUARDANDO_PAGAMENTO');
      expect(result.allowed).toBe(true);
    });

    it('AGUARDANDO_PAGAMENTO pode ir para PAGO', () => {
      const result = validateTransition('AGUARDANDO_PAGAMENTO', 'PAGO');
      expect(result.allowed).toBe(true);
    });

    it('PAGO pode ir para DESPACHADO', () => {
      const result = validateTransition('PAGO', 'DESPACHADO');
      expect(result.allowed).toBe(true);
    });
  });

  describe('transições inválidas', () => {
    it('card novo não pode ir para EM_NEGOCIACAO diretamente', () => {
      const result = validateTransition(null, 'EM_NEGOCIACAO');
      expect(result.allowed).toBe(false);
      expect(result.anomaly_code).toBe('INVALID_INITIAL_STATE');
    });

    it('CONCLUIDO é estado terminal — nenhuma transição é permitida', () => {
      const result = validateTransition('CONCLUIDO', 'PRIMEIRO_CONTATO');
      expect(result.allowed).toBe(false);
      expect(result.anomaly_code).toBe('TERMINAL_STATE');
    });

    it('transição para a mesma coluna é bloqueada', () => {
      const result = validateTransition('PRIMEIRO_CONTATO', 'PRIMEIRO_CONTATO');
      expect(result.allowed).toBe(false);
      expect(result.anomaly_code).toBe('SAME_COLUMN');
    });
  });

  describe('resultado de transições inválidas', () => {
    it('retorna mensagem de erro legível', () => {
      const result = validateTransition('CONCLUIDO', 'PAGO');
      expect(result.allowed).toBe(false);
      expect(result.message).toBeTruthy();
      expect(typeof result.message).toBe('string');
    });
  });
});

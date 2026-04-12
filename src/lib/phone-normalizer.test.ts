import { describe, it, expect } from 'vitest';
import { PhoneNormalizer } from '@/lib/phone-normalizer';

describe('PhoneNormalizer', () => {
  describe('normalize — adiciona DDI e 9º dígito', () => {
    it('normaliza número brasileiro sem DDI', () => {
      expect(PhoneNormalizer.normalize('62999998888')).toBe('5562999998888');
    });

    it('normaliza número já com DDI', () => {
      expect(PhoneNormalizer.normalize('5562999998888')).toBe('5562999998888');
    });

    it('normaliza número com formatação (parênteses, hífen, espaço)', () => {
      expect(PhoneNormalizer.normalize('(62) 99999-8888')).toBe('5562999998888');
    });

    it('adiciona 9º dígito em número sem ele', () => {
      // 6299998888 (sem 9º dígito) → 5562999998888
      expect(PhoneNormalizer.normalize('6299998888')).toBe('5562999998888');
    });

    it('retorna string vazia para entrada vazia', () => {
      expect(PhoneNormalizer.normalize('')).toBe('');
    });
  });

  describe('canonical — remove 9º dígito para matching', () => {
    it('remove 9º dígito de número com DDI', () => {
      expect(PhoneNormalizer.canonical('5562999998888')).toBe('556299998888');
    });

    it('normaliza e remove 9º dígito de número sem DDI', () => {
      expect(PhoneNormalizer.canonical('62999998888')).toBe('556299998888');
    });

    it('número sem 9º dígito retorna sem alteração (já canônico)', () => {
      expect(PhoneNormalizer.canonical('556299998888')).toBe('556299998888');
    });

    it('retorna string vazia para entrada vazia', () => {
      expect(PhoneNormalizer.canonical('')).toBe('');
    });
  });

  describe('validate', () => {
    it('valida número celular brasileiro válido', () => {
      expect(PhoneNormalizer.validate('62999998888')).toBe(true);
    });

    it('rejeita número muito curto', () => {
      expect(PhoneNormalizer.validate('123')).toBe(false);
    });

    it('rejeita string vazia', () => {
      expect(PhoneNormalizer.validate('')).toBe(false);
    });
  });
});

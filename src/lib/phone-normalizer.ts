/**
 * PhoneNormalizer - Utilitário para normalização de números de telefone brasileiros.
 *
 * REGRA FUNDAMENTAL:
 * - `normalize(raw)` → formato de exibição com DDI e 9º dígito: 5562999998888
 * - `canonical(raw)` → formato de matching SEM 9º dígito: 556299998888
 * - Todos os métodos são puros (sem side effects)
 *
 * @example
 * PhoneNormalizer.normalize('62 99999-8888')   → '5562999998888'
 * PhoneNormalizer.canonical('62 99999-8888')    → '556299998888'
 * PhoneNormalizer.canonical('5562999998888')    → '556299998888'
 * PhoneNormalizer.format('5562999998888')       → '(62) 99999-8888'
 * PhoneNormalizer.validate('62999998888')       → true
 */
export class PhoneNormalizer {
  private static readonly DDI_BRASIL = '55';

  /** Regex para celular com 9º dígito: DDD(2) + 9 + número(8) */
  private static readonly MOBILE_WITH_NINE = /^(\d{2})(9)(\d{8})$/;

  /** Regex para número sem 9º dígito: DDD(2) + número(8) */
  private static readonly MOBILE_WITHOUT_NINE = /^(\d{2})(\d{8})$/;

  /** DDDs válidos do Brasil */
  private static readonly VALID_DDDS = new Set([
    '11', '12', '13', '14', '15', '16', '17', '18', '19', // SP
    '21', '22', '24', // RJ
    '27', '28', // ES
    '31', '32', '33', '34', '35', '37', '38', // MG
    '41', '42', '43', '44', '45', '46', // PR
    '47', '48', '49', // SC
    '51', '53', '54', '55', // RS
    '61', // DF
    '62', '64', // GO
    '63', // TO
    '65', '66', // MT
    '67', // MS
    '68', // AC
    '69', // RO
    '71', '73', '74', '75', '77', // BA
    '79', // SE
    '81', '87', // PE
    '82', // AL
    '83', // PB
    '84', // RN
    '85', '88', // CE
    '86', '89', // PI
    '91', '93', '94', // PA
    '92', '97', // AM
    '95', // RR
    '96', // AP
    '98', '99', // MA
  ]);

  /**
   * Remove todos os caracteres não numéricos.
   */
  private static clean(raw: string): string {
    return raw.replace(/\D/g, '');
  }

  /**
   * Garante que o número tenha DDI 55.
   */
  private static ensureDDI(digits: string): string {
    if (digits.startsWith(this.DDI_BRASIL) && digits.length >= 12) {
      return digits;
    }
    return this.DDI_BRASIL + digits;
  }

  /**
   * Normaliza para formato completo com DDI e 9º dígito.
   * Formato final: 55XXXXXXXXXXX (13 dígitos)
   *
   * @example
   * normalize('62999998888')     → '5562999998888'
   * normalize('5562999998888')   → '5562999998888'
   * normalize('(62) 99999-8888') → '5562999998888'
   * normalize('+55 62 9999-8888')→ '5562999998888' (adiciona 9º dígito)
   */
  static normalize(raw: string): string {
    if (!raw) return '';

    const digits = this.clean(raw);
    const withDDI = this.ensureDDI(digits);
    const withoutDDI = withDDI.slice(2);

    // Caso 1: Já tem 11 dígitos (DDD + 9 + 8 dígitos) → OK
    const matchWithNine = withoutDDI.match(this.MOBILE_WITH_NINE);
    if (matchWithNine) {
      return `${this.DDI_BRASIL}${withoutDDI}`;
    }

    // Caso 2: Tem 10 dígitos (DDD + 8 dígitos) → Adicionar 9
    const matchWithoutNine = withoutDDI.match(this.MOBILE_WITHOUT_NINE);
    if (matchWithoutNine) {
      const [, ddd, number] = matchWithoutNine;
      // Verificar se é celular (começa com 6, 7, 8 ou 9)
      const firstDigit = number[0];
      if (['6', '7', '8', '9'].includes(firstDigit)) {
        return `${this.DDI_BRASIL}${ddd}9${number}`;
      }
      // Fixo: retorna sem adicionar 9
      return `${this.DDI_BRASIL}${withoutDDI}`;
    }

    // Fallback: retorna com DDI
    return withDDI;
  }

  /**
   * Canonical: Formato de matching no banco de dados.
   * Remove o 9º dígito de celulares para matching confiável.
   * Formato final: 55XXXXXXXXXX (12 dígitos)
   *
   * @example
   * canonical('5562999998888')    → '556299998888'
   * canonical('62999998888')      → '556299998888'
   * canonical('556299998888')     → '556299998888' (já sem 9)
   * canonical('(62) 99999-8888')  → '556299998888'
   * canonical('6232108888')       → '556232108888' (fixo, não remove nada)
   */
  static canonical(raw: string): string {
    if (!raw) return '';

    const digits = this.clean(raw);
    const withDDI = this.ensureDDI(digits);
    const withoutDDI = withDDI.slice(2);

    // Caso: 11 dígitos (DDD + 9 + 8 dígitos) → Remover o 9
    const matchWithNine = withoutDDI.match(this.MOBILE_WITH_NINE);
    if (matchWithNine) {
      const [, ddd, , number] = matchWithNine; // ignora o '9'
      return `${this.DDI_BRASIL}${ddd}${number}`;
    }

    // Caso: 10 dígitos (DDD + 8 dígitos) → Já está sem 9
    const matchWithoutNine = withoutDDI.match(this.MOBILE_WITHOUT_NINE);
    if (matchWithoutNine) {
      return `${this.DDI_BRASIL}${withoutDDI}`;
    }

    // Fallback
    return withDDI;
  }

  /**
   * Formata para exibição legível: (XX) XXXXX-XXXX
   *
   * @example
   * format('5562999998888') → '(62) 99999-8888'
   * format('62999998888')   → '(62) 99999-8888'
   */
  static format(raw: string): string {
    if (!raw) return '';

    const normalized = this.normalize(raw);
    const withoutDDI = normalized.slice(2);

    if (withoutDDI.length === 11) {
      // Celular: (XX) XXXXX-XXXX
      return `(${withoutDDI.slice(0, 2)}) ${withoutDDI.slice(2, 7)}-${withoutDDI.slice(7)}`;
    }

    if (withoutDDI.length === 10) {
      // Fixo: (XX) XXXX-XXXX
      return `(${withoutDDI.slice(0, 2)}) ${withoutDDI.slice(2, 6)}-${withoutDDI.slice(6)}`;
    }

    return raw;
  }

  /**
   * Valida se o número é um telefone brasileiro válido.
   */
  static validate(raw: string): boolean {
    if (!raw) return false;

    try {
      const digits = this.clean(raw);
      if (digits.length < 10 || digits.length > 13) return false;

      const withDDI = this.ensureDDI(digits);
      const withoutDDI = withDDI.slice(2);
      const ddd = withoutDDI.slice(0, 2);

      // Validar DDD
      if (!this.VALID_DDDS.has(ddd)) return false;

      // Validar comprimento (10 ou 11 dígitos sem DDI)
      if (withoutDDI.length !== 10 && withoutDDI.length !== 11) return false;

      // Se 11 dígitos, o 3º dígito deve ser 9
      if (withoutDDI.length === 11 && withoutDDI[2] !== '9') return false;

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Garante DDI 55 no número.
   *
   * @example
   * withDDI('62999998888')     → '5562999998888'
   * withDDI('5562999998888')   → '5562999998888'
   */
  static withDDI(raw: string): string {
    if (!raw) return '';
    const digits = this.clean(raw);
    return this.ensureDDI(digits);
  }

  /**
   * Extrai o DDD do número.
   *
   * @example
   * getDDD('5562999998888') → '62'
   * getDDD('62999998888')   → '62'
   */
  static getDDD(raw: string): string {
    if (!raw) return '';
    const digits = this.clean(raw);
    const withDDI = this.ensureDDI(digits);
    return withDDI.slice(2, 4);
  }
}

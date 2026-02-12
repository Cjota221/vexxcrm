# 🤝 Guia de Contribuição — VEXX CRM 2.0

Obrigado por considerar contribuir com o VEXX CRM 2.0! Este documento descreve o processo de desenvolvimento e as convenções do projeto.

---

## 📋 Índice

1. [Workflow de Desenvolvimento](#workflow-de-desenvolvimento)
2. [Convenções de Código](#convenções-de-código)
3. [Commits Semânticos](#commits-semânticos)
4. [Pull Requests](#pull-requests)
5. [Testes](#testes)
6. [Documentação](#documentação)

---

## 🔄 Workflow de Desenvolvimento

### 1. Fork & Clone
```bash
# Fork o repositório no GitHub
# Clone seu fork
git clone https://github.com/SEU-USUARIO/vexxcrm.git
cd vexxcrm

# Adicione o upstream
git remote add upstream https://github.com/Cjota221/vexxcrm.git
```

### 2. Crie uma Branch
```bash
# Sincronize com main
git checkout main
git pull upstream main

# Crie branch para sua feature
git checkout -b feature/nome-da-feature
# OU
git checkout -b fix/nome-do-bug
```

### 3. Desenvolva
```bash
# Instale dependências
npm install

# Configure .env.local (copie de .env.local.example)
cp .env.local.example .env.local

# Rode o servidor de desenvolvimento
npm run dev
```

### 4. Commit & Push
```bash
# Adicione suas mudanças
git add .

# Commit com mensagem semântica
git commit -m "feat(whatsapp): adiciona suporte a áudio"

# Push para seu fork
git push origin feature/nome-da-feature
```

### 5. Pull Request
1. Abra PR do seu fork para `Cjota221/vexxcrm:main`
2. Descreva suas mudanças
3. Referencie issues relacionadas
4. Aguarde review

---

## 💻 Convenções de Código

### Arquivos e Pastas
```
kebab-case.tsx         # Arquivos
PascalCase             # Componentes React
camelCase              # Funções e variáveis
UPPER_SNAKE_CASE       # Constantes
```

### TypeScript
```typescript
// ✅ BOM
export interface ClientData {
  id: string;
  name: string;
  phone: string;
}

export function normalizePhone(phone: string): string {
  // ...
}

// ❌ RUIM
export interface client_data {
  ID: string;
  Name: string;
}

function NormalizePhone(Phone) {
  // ...
}
```

### Ordem de Imports
```typescript
// 1. External libs
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

// 2. Internal libs
import { supabase } from '@/lib/supabase';
import { PhoneNormalizer } from '@/lib/phone-normalizer';

// 3. Components
import { Button } from '@/components/ui/Button';
import { ChatList } from '@/components/chat/ChatList';

// 4. Types
import type { Client, Message } from '@/types';

// 5. Styles (se necessário)
import styles from './styles.module.css';
```

### Comentários
```typescript
// ✅ BOM — Explica o "porquê"
// Normaliza telefone ANTES de buscar no banco para evitar duplicatas
const normalized = PhoneNormalizer.canonical(phone);

// ❌ RUIM — Explica o óbvio
// Normaliza o telefone
const normalized = PhoneNormalizer.canonical(phone);
```

---

## 📝 Commits Semânticos

Usamos [Conventional Commits](https://www.conventionalcommits.org/):

### Formato
```
<type>(<scope>): <description>

[corpo opcional]

[footer opcional]
```

### Types
- `feat`: Nova funcionalidade
- `fix`: Correção de bug
- `docs`: Mudanças em documentação
- `style`: Formatação (não afeta código)
- `refactor`: Refatoração (não adiciona feature nem corrige bug)
- `perf`: Melhoria de performance
- `test`: Adiciona ou corrige testes
- `chore`: Manutenção (build, CI, etc.)

### Scopes
- `whatsapp`: Integração WhatsApp
- `facilzap`: Integração FacilZap
- `anne`: IA Anne
- `auth`: Autenticação
- `crm`: CRM de clientes
- `campaigns`: Campanhas
- `ui`: Componentes UI
- `api`: API routes
- `db`: Database/migrations

### Exemplos
```bash
# Feature
git commit -m "feat(whatsapp): adiciona suporte a envio de áudio"

# Bug fix
git commit -m "fix(auth): corrige logout não limpando sessão"

# Breaking change
git commit -m "refactor(api)!: migra autenticação para JWT

BREAKING CHANGE: Remove suporte a sessão por cookie"

# Documentação
git commit -m "docs(readme): atualiza instruções de instalação"
```

---

## 🔀 Pull Requests

### Checklist
Antes de abrir o PR, verifique:

- [ ] ✅ Código segue as convenções do projeto
- [ ] ✅ Commits seguem padrão semântico
- [ ] ✅ `npm run lint` passa sem erros
- [ ] ✅ `npm run build` funciona
- [ ] ✅ Testes (se aplicável) estão passando
- [ ] ✅ Documentação atualizada (se necessário)
- [ ] ✅ Sem credenciais hardcoded
- [ ] ✅ `.gitignore` protege arquivos sensíveis

### Template de PR
```markdown
## 📋 Descrição
<!-- Descreva suas mudanças -->

## 🎯 Tipo de Mudança
- [ ] 🐛 Bug fix
- [ ] ✨ Nova feature
- [ ] 💥 Breaking change
- [ ] 📝 Documentação

## 🧪 Como Testar
<!-- Instruções para testar suas mudanças -->

1. Rode `npm run dev`
2. Navegue para `/atendimento`
3. Verifique que...

## 📸 Screenshots
<!-- Se aplicável -->

## ✅ Checklist
- [ ] Lint passa (`npm run lint`)
- [ ] Build funciona (`npm run build`)
- [ ] Testado localmente
- [ ] Documentação atualizada

## 🔗 Issues Relacionadas
Closes #123
```

---

## 🧪 Testes

### Executar Testes
```bash
# Unit tests (quando implementados)
npm run test

# E2E tests (quando implementados)
npm run test:e2e

# Coverage
npm run test:coverage
```

### Escrevendo Testes
```typescript
// tests/lib/phone-normalizer.test.ts
import { PhoneNormalizer } from '@/lib/phone-normalizer';

describe('PhoneNormalizer', () => {
  describe('canonical()', () => {
    it('should normalize Brazilian phone with DDD', () => {
      const result = PhoneNormalizer.canonical('(11) 99999-8888');
      expect(result).toBe('5511999998888');
    });

    it('should add 9th digit if missing', () => {
      const result = PhoneNormalizer.canonical('11 9999-8888');
      expect(result).toBe('5511999998888');
    });

    it('should throw on invalid DDD', () => {
      expect(() => {
        PhoneNormalizer.canonical('99 99999-8888');
      }).toThrow('DDD inválido');
    });
  });
});
```

---

## 📚 Documentação

### Quando Documentar
- **Nova API route**: Adicionar em comentário TSDoc
- **Nova integração**: Criar arquivo em `/docs`
- **Breaking changes**: Atualizar `README.md` e migration guide
- **Novos env vars**: Adicionar em `.env.local.example`

### TSDoc para API Routes
```typescript
/**
 * POST /api/whatsapp/send
 * 
 * Envia mensagem WhatsApp para um cliente
 * 
 * @route POST /api/whatsapp/send
 * @access Authenticated (JWT)
 * @ratelimit 100 requests/minute
 * 
 * @param {string} to - Telefone do destinatário (será normalizado)
 * @param {string} content - Conteúdo da mensagem
 * @param {string} [type='text'] - Tipo: 'text' | 'image' | 'video' | 'audio'
 * @param {string} [mediaUrl] - URL da mídia (se type != 'text')
 * 
 * @returns {Promise<{success: boolean, messageId: string}>}
 * 
 * @throws {401} Se não autenticado
 * @throws {403} Se WhatsApp não conectado
 * @throws {500} Se Evolution API falhar
 * 
 * @example
 * ```typescript
 * const res = await fetch('/api/whatsapp/send', {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${token}` },
 *   body: JSON.stringify({
 *     to: '11999998888',
 *     content: 'Olá!',
 *   }),
 * });
 * ```
 */
export async function POST(request: Request) {
  // ...
}
```

---

## 🚨 Regras Críticas

### ⛔ NUNCA FAÇA
1. ❌ Commitar credenciais (API keys, tokens, passwords)
2. ❌ Remover validação de `tenant_id` em queries
3. ❌ Adicionar `console.log()` em produção sem remover depois
4. ❌ Hardcodar valores que devem vir de env vars
5. ❌ Fazer `git push --force` na branch `main`

### ✅ SEMPRE FAÇA
1. ✅ Filtrar por `tenant_id` em TODAS as queries Supabase
2. ✅ Usar `PhoneNormalizer.canonical()` antes de buscar cliente
3. ✅ Validar autenticação com `getTenantFromRequest()` em API routes
4. ✅ Testar localmente antes de abrir PR
5. ✅ Atualizar documentação se sua mudança afeta uso externo

---

## 🤝 Código de Conduta

- 🫱🏽‍🫲🏻 Seja respeitoso e inclusivo
- 💬 Critique código, não pessoas
- 🎯 Foque em soluções, não problemas
- 📖 Compartilhe conhecimento
- 🙏 Agradeça contribuições

---

## 📞 Contato

- **Issues**: [GitHub Issues](https://github.com/Cjota221/vexxcrm/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Cjota221/vexxcrm/discussions)
- **Email**: cjota@vexxcrm.com (para assuntos privados)

---

**Obrigado por contribuir! 🚀**

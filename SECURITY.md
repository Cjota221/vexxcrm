# 🔒 Política de Segurança

## 📋 Versões Suportadas

Atualmente, suportamos apenas a versão mais recente do VEXX CRM 2.0:

| Versão | Suportada          |
| ------ | ------------------ |
| 2.0.x  | :white_check_mark: |
| < 2.0  | :x:                |

## 🐛 Reportando uma Vulnerabilidade

Levamos a segurança muito a sério. Se você descobriu uma vulnerabilidade de segurança, por favor **NÃO** abra uma issue pública.

### Como Reportar

1. **Email**: Envie detalhes para **security@vexxcrm.com** (ou email privado do mantenedor)
2. **Assunto**: `[SECURITY] Descrição breve da vulnerabilidade`
3. **Conteúdo**: Inclua:
   - Descrição detalhada da vulnerabilidade
   - Passos para reproduzir
   - Impacto potencial
   - Sugestão de correção (se houver)
   - Sua informação de contato (se quiser crédito)

### O que Esperar

- **Resposta inicial**: Dentro de 48 horas
- **Avaliação**: Dentro de 1 semana
- **Correção**: Dependendo da severidade, de 1 a 4 semanas
- **Divulgação**: Após correção, com seu consentimento

### Recompensas

Embora não tenhamos um programa formal de bug bounty, reconhecemos e creditamos pesquisadores responsáveis que nos ajudam a melhorar a segurança.

---

## 🛡️ Melhores Práticas de Segurança

### Para Desenvolvedores

#### ⛔ NUNCA faça:
- ❌ Commitar credenciais (API keys, tokens, senhas)
- ❌ Hardcodar secrets no código
- ❌ Desabilitar RLS sem motivo válido
- ❌ Usar `SELECT *` sem filtro de `tenant_id`
- ❌ Expor endpoints sem autenticação
- ❌ Loggar dados sensíveis

#### ✅ SEMPRE faça:
- ✅ Use variáveis de ambiente (`.env.local`)
- ✅ Valide autenticação com `getTenantFromRequest()`
- ✅ Filtre queries por `tenant_id` (multi-tenant isolation)
- ✅ Valide e sanitize inputs do usuário
- ✅ Use HTTPS em produção
- ✅ Mantenha dependências atualizadas (`npm audit`)

### Para Administradores

#### Configuração do Supabase
```sql
-- Certifique-se de que RLS está habilitado em TODAS as tabelas
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
-- ... (todas as outras tabelas)

-- Verifique que a função get_tenant_id() está correta
SELECT public.get_tenant_id();
```

#### Variáveis de Ambiente
```bash
# NUNCA use as mesmas credenciais em dev e prod
# Rotacione chaves regularmente (a cada 90 dias)

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=... # Anon key (segura para frontend)
SUPABASE_SERVICE_KEY=...          # Service key (NUNCA exponha!)

# Evolution API
EVOLUTION_API_KEY=...              # Rotacione a cada 90 dias

# OpenAI
OPENAI_API_KEY=...                 # Monitore uso e custos
```

#### Webhook Security
```javascript
// Evolution API webhook DEVE validar apikey
// Configurar na Evolution API:
webhook_url: https://app.vexxcrm.com/api/webhooks/evolution
webhook_headers: {
  "apikey": "sua-api-key-unica-por-tenant"
}
```

---

## 🔍 Checklist de Segurança (Deploy)

Antes de fazer deploy em produção:

### Infraestrutura
- [ ] HTTPS habilitado (certificado SSL válido)
- [ ] Firewall configurado (apenas portas necessárias)
- [ ] Rate limiting ativo (previne DDoS)
- [ ] Backups automáticos configurados
- [ ] Logs centralizados e monitorados

### Aplicação
- [ ] ZERO credenciais hardcoded no código
- [ ] `.env` no `.gitignore`
- [ ] RLS habilitado em todas as tabelas
- [ ] Webhooks com autenticação
- [ ] CORS configurado (sem wildcards)
- [ ] `npm audit` sem vulnerabilidades críticas

### Supabase
- [ ] Policies RLS testadas para todos os tenants
- [ ] Service key apenas em env vars do servidor
- [ ] Anon key pode ser exposta (apenas leitura pública)
- [ ] Email authentication configurada
- [ ] Confirmação de email habilitada

### WhatsApp (Evolution API)
- [ ] Instância por tenant (não compartilhada)
- [ ] API key única por tenant
- [ ] Webhook com autenticação
- [ ] Rate limiting configurado

---

## 📚 Recursos Adicionais

### Leitura Recomendada
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/row-level-security)
- [Next.js Security Headers](https://nextjs.org/docs/app/api-reference/next-config-js/headers)

### Ferramentas de Segurança
- **npm audit**: `npm audit --audit-level=moderate`
- **TruffleHog**: Detecta secrets commitados
- **Snyk**: Monitora vulnerabilidades de dependências
- **OWASP ZAP**: Testes de penetração

---

## 📝 Histórico de Vulnerabilidades

> Nenhuma vulnerabilidade reportada até o momento (projeto novo).

Quando vulnerabilidades forem descobertas e corrigidas, elas serão listadas aqui com:
- **CVE ID** (se aplicável)
- **Severidade** (Crítica, Alta, Média, Baixa)
- **Descrição**
- **Versão afetada**
- **Correção** (versão que corrige)
- **Crédito** (pesquisador responsável)

---

## 🤝 Agradecimentos

Agradecemos aos seguintes pesquisadores de segurança que nos ajudaram a melhorar o VEXX CRM:

> Nenhum ainda. Seja o primeiro! 🎖️

---

**Última atualização**: 12 de Fevereiro de 2026

**Contato de Segurança**: security@vexxcrm.com

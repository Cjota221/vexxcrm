# Diagnóstico — Página de Públicos

> Análise forense — leitura pura, sem alterações de código.
> Data: 2026-04-05

---

## O que funciona de verdade

| Funcionalidade | Arquivo | Detalhe |
|---|---|---|
| Jarvis gera configurações de públicos | `src/lib/services/jarvis-trafego.service.ts:123` | Modelo `claude-haiku-4-5-20251001`, retorna 4 públicos configurados |
| Busca IDs reais de interesse no Meta | `src/lib/services/meta-audiences.service.ts:45` | `GET /search?type=adinterest&q=...&locale=pt_BR`, cache 1h |
| Estimativa de alcance | `src/lib/services/meta-audiences.service.ts:71` | `GET /act_{id}/reachestimate` |
| Salva públicos no banco local | `src/lib/services/meta-audiences.service.ts:166` | Insere em `meta_audiences` com `status: 'pronto'` |
| Custom Audience de remarketing no Meta | `src/lib/services/meta-audiences.service.ts:206` | `POST /act_{id}/customaudiences`, preenche `meta_audience_id` |
| Custom Audience de visitantes do site | `src/lib/services/meta-publicos-cj.service.ts:168` | `POST /customaudiences`, preenche `meta_audience_id` |
| Lookalike a partir de clientes | `src/lib/services/meta-publicos-cj.service.ts:242` | 2 POSTs (seed + lookalike), preenche `meta_audience_id` |

---

## O que é só banco sem Meta

**Públicos de INTERESSE** — nunca são criados no Meta.

Fluxo real após "Criar com IA":
```
Jarvis gera 4 públicos (com interesses em português)
  ↓
Para cada público de interesse:
  ├─ Resolve IDs reais dos interesses no Meta ✓
  ├─ Estima alcance ✓
  ├─ Salva em meta_audiences com meta_audience_id = NULL ✗
  └─ NÃO faz POST /saved_audiences no Meta ✗
```

**Arquivo raiz do problema:** `src/lib/services/meta-audiences.service.ts`, função `criarPublicoMeta()` linhas 119–198.

A função vai direto para `supabase.insert()` sem nenhuma chamada à Meta API:
```typescript
// O que DEVERIA ter (como faz criarPublicoRemarketing):
const res = await fetch(`${META_BASE}/act_${accountId}/saved_audiences`, {
  method: 'POST', ...
});
const metaAudienceId = resData.id;

// O que TEM hoje (vai direto pro banco):
const { data: salvo } = await supabase.from('meta_audiences').insert({ ... })
// meta_audience_id nunca é preenchido
```

**Nota:** A Meta API não tem endpoint `/saved_audiences` via API pública. O targeting de interesse é usado **diretamente no adset**, não como público salvo separado. Portanto o comportamento atual (salvar só no banco) é **tecnicamente correto** — o `meta_audience_id` só faz sentido para Custom Audiences reais.

---

## O que é completamente quebrado

Nada está completamente quebrado — mas há desinformação no frontend:

1. **Campo `meta_audience_id` sempre NULL para interesse** — o frontend exibe "⚠️ Ainda não publicado no Meta" para todos os públicos de interesse, mesmo sendo o comportamento esperado
2. **Botão "Publicar no Meta" para interesse** — enganoso; o correto é "Pronto para usar no agente" (o targeting é aplicado diretamente no adset, não há "publicar" necessário)
3. **Estimativa de alcance retorna "Calculando..."** — a API `/reachestimate` pode falhar ou retornar null para configurações incompletas

---

## O que falta para funcionar de verdade

### Prioridade alta

1. **Frontend: Remover o "⚠️ Ainda não publicado no Meta" para tipo 'interesse'**
   - Públicos de interesse são configurações de targeting, não Custom Audiences
   - Exibir: "✅ Targeting configurado — pronto para usar no agente"

2. **Frontend: Trocar texto do botão "Publicar no Meta"**
   - Para 'interesse': sumir o botão (já está pronto) ou mostrar "Usar nesta campanha →"
   - Para 'remarketing'/'lookalike': manter "Criar no Meta"

3. **Rota `/api/trafego/publicos/[id]/publicar-meta`** — não existe
   - Necessária para o botão de remarketing/lookalike funcionar
   - Deve chamar `criarPublicoRemarketing()` ou `criarLookalikeClientes()`

### Prioridade média

4. **Rota `PATCH /api/trafego/publicos/[id]`** — verificar se existe para o botão de status
5. **Conectar públicos ao agente** — quando o usuário cria campanha, o targeting do público salvo deveria ser injetado automaticamente no adset

---

## Estimativa de trabalho para corrigir

| Item | Esforço | Impacto |
|---|---|---|
| Corrigir texto "não publicado" no frontend (interesse) | 15 min | Alto — remove confusão do usuário |
| Criar rota `POST /api/trafego/publicos/[id]/publicar-meta` | 1h | Alto — habilita remarketing real |
| Criar rota `PATCH /api/trafego/publicos/[id]` | 30 min | Médio |
| Injetar targeting do público salvo no agente de campanha | 2h | Alto — fecha o loop completo |
| Criar rota `POST /api/trafego/publicos/criar-com-ia` dedicada | 1h | Baixo — já funciona via `/api/ai-team/create-audiences` |

**Total estimado:** ~4h30 para corrigir tudo.
**Mínimo viável:** 15 min para parar de enganar o usuário com "não publicado no Meta".

---

## Resumo para decisão

| Pergunta | Resposta |
|---|---|
| "Criar com IA" funciona? | Sim — Jarvis gera, IDs são resolvidos, banco é salvo |
| Públicos de interesse existem no Meta? | Não — e não precisam: targeting é aplicado no adset, não em Saved Audience |
| Remarketing funciona no Meta? | Sim — cria Custom Audience real com `meta_audience_id` |
| O frontend está enganando o usuário? | Sim — mostra "não publicado" para algo que está certo |
| Algo crítico está quebrado? | Não — é um problema de UX e de uma rota faltando |

# IAs no módulo Tráfego Pago

> Análise forense — leitura pura, sem alterações de código.
> Data: 2026-04-05

---

## José (GPT-4o-mini / OpenAI) faz:

### José 1A — Analista de Público CRM
- Analisa dados do CRM (clientes, pedidos, leads) do tenant
- Recomenda 4 tipos de público para Meta Ads: Revendedoras, Franqueadas C4, Marca Própria, Remarketing
- Retorna faixa etária, estados, interesses, comportamentos e tamanho estimado de cada público
- **Arquivo:** `src/lib/services/jose-audience-analyst.service.ts` → `joseAnalisarDadosParaPublicos()`
- **Chamado por:** `audience-orchestrator.service.ts:77` → `criarPublicosComIA()`
- **Rota:** Nenhuma direta — acionado via `POST /api/trafego/publicos/criar-com-ia` (se existir) ou pelo botão "Criar públicos com IA" no dashboard

### José 1B — Analista de Performance de Campanhas
- Analisa métricas brutas de campanhas Meta Ads ativas (ROAS, CPL, CTR)
- Classifica campanhas como: ruins / escalando / pausar imediato
- Identifica anomalias e gera alertas críticos
- **Arquivo:** `src/lib/services/jose-analyst.service.ts` → `joseAnalyzeMetrics()`
- **Chamado por:** `ai-team-orchestrator.service.ts:237` → `runFullAnalysis()`
- **Rota:** Acionado pelo cron/trigger de análise automática

---

## Cláudio (GPT-4o-mini / OpenAI) faz:

### Cláudio 2A — Configurador de Públicos
- Recebe recomendações do José 1A sobre públicos
- Traduz para configuração técnica pronta para Meta Ads API:
  - Interesses reais (nomes validados em português)
  - Geo-locations (países e regiões)
  - Targeting completo (idade, gênero, comportamentos)
- Gera copy sugerido (headline, texto, CTA)
- **Arquivo:** `src/lib/services/claudio-audience-creator.service.ts` → `claudioRefiniarPublicos()`
- **Chamado por:** `audience-orchestrator.service.ts:86` → `criarPublicosComIA()`

### Cláudio 2B — Estrategista de Tráfego
- Recebe análise do José 1B
- Gera ações: pausar anúncio, escalar +30%, reduzir orçamento, criar copy novo, testar público novo
- Gera copies de anúncio com restrições técnicas Meta (40 chars headline, 125 chars texto)
- Gera novos públicos (interesse, lookalike, remarketing)
- **Arquivo:** `src/lib/services/claudio-strategist.service.ts` → `claudioGenerateStrategy()`
- **Chamado por:** `ai-team-orchestrator.service.ts:246` → `runFullAnalysis()`

---

## Pedro (GPT-4o-mini / OpenAI) faz:

- Pesquisa tendências de mercado para o produto/público
- Identifica oportunidades sazonais e eventos relevantes
- Analisa estratégias de concorrentes
- Fornece insights acionáveis para campanhas
- **Arquivo:** `src/lib/services/pedro-researcher.service.ts` → `pedroResearchTrends()`
- **Chamado por:** `ai-team-orchestrator.service.ts:250` → `runFullAnalysis()` (em paralelo com Cláudio 2B)

---

## Judite (GPT-4o-mini Vision / OpenAI) faz:

- Avalia imagens de criativos de anúncios visualmente
- Retorna nota 1-10, aprovação, pontos positivos/negativos
- Marca elementos críticos (problemas urgentes)
- Fornece sugestões de melhoria visual
- **Arquivo:** `src/lib/services/judite-visual.service.ts` → `juditeEvaluateCreative()`, `juditeQuickRate()`
- **Não é chamada automaticamente** — disponível como utilitário

---

## Anne (Llama 3.3 70B / Groq) faz:

- Atendimento automático via WhatsApp
- Classificação de intenção de mensagens de clientes
- Responde perguntas, oferece suporte
- **Arquivo:** `src/lib/services/anne.service.ts`, `src/lib/services/groq.service.ts`
- **Modelo:** `llama-3.3-70b-versatile` via `https://api.groq.com/openai/v1/chat/completions`
- **Não atua no módulo Tráfego Pago diretamente**

---

## Jarvis (Claude Haiku / Anthropic) faz:

- Chat conversacional com tools de acesso ao VEXX
- **Arquivo:** `src/app/api/jarvis/chat/route.ts`
- **Tools disponíveis:**
  - `buscar_campanhas_meta` — performance de campanhas (ROAS, CPL, gastos)
  - `buscar_vendas` — faturamento, ticket médio, por mês
  - `criar_campanha` — cria campanha Meta pausada para aprovação
  - `buscar_clientes`, `buscar_produtos`, `buscar_kanban`, `buscar_reativacao`, `buscar_conversas_anne`, `buscar_base_conhecimento`, `gerar_relatorio`

---

## Pipeline de execução (Orquestrador)

```
runFullAnalysis(tenantId)           ← ai-team-orchestrator.service.ts
  ├─ 1. Carregar config do tenant
  ├─ 2. José 1B analisa métricas Meta     (GPT-4o-mini)
  ├─ 3. Paralelamente:
  │   ├─ Cláudio 2B gera estratégia       (GPT-4o-mini)
  │   └─ Pedro pesquisa tendências        (GPT-4o-mini)
  ├─ 4. Salvar ações em ai_action_queue
  ├─ 5. Salvar copies em ai_generated_copies
  └─ 6. Notificar via WhatsApp

criarPublicosComIA(tenantId)        ← audience-orchestrator.service.ts
  ├─ 1. José 1A analisa CRM               (GPT-4o-mini)
  ├─ 2. Cláudio 2A refina para Meta API   (GPT-4o-mini)
  └─ 3. Meta API cria públicos → Supabase salva
```

---

## O que precisa migrar para o Jarvis:

| Função atual | Quem faz hoje | Jarvis já tem? | Ação recomendada |
|---|---|---|---|
| Analisar performance de campanhas | José 1B (GPT-4o-mini) | ✅ tool `buscar_campanhas_meta` | Migrar: Jarvis consulta e analisa via chat |
| Gerar estratégia de ação | Cláudio 2B (GPT-4o-mini) | Parcial (`criar_campanha`) | Migrar: Jarvis pode sugerir ações e executar |
| Criar campanhas | `agente-trafego.service.ts` (sem IA) | ✅ tool `criar_campanha` | Jarvis já pode criar via chat |
| Relatórios consolidados | Nenhum endpoint hoje | ✅ tool `gerar_relatorio` | Implementar no Jarvis |
| Pesquisa de tendências | Pedro (GPT-4o-mini) | Parcial (`buscar_base_conhecimento`) | Manter Pedro ou alimentar base do Jarvis |
| Avaliação de criativos | Judite (GPT-4o-mini Vision) | ❌ Claude Haiku não tem visão | Manter Judite separada |
| Criação de públicos Meta | José 1A + Cláudio 2A | ❌ Jarvis não tem tool `criar_publico` | Criar tool no Jarvis ou manter pipeline atual |

---

## Variáveis de ambiente usadas

| Variável | Usada por |
|---|---|
| `OPENAI_API_KEY` | José (1A/1B), Cláudio (2A/2B), Pedro, Judite |
| `GROQ_API_KEY` | Anne |
| `ANTHROPIC_API_KEY` | Jarvis (fallback — chave por tenant fica em `ai_provider_config`) |
| `META_PAGE_ID` | Agente Tráfego |
| `META_WHATSAPP_NUMBER` | Notificações |

---

## Chaves por tenant (tabela `ai_provider_config`)

- `meta_access_token`, `meta_ad_account_id`, `meta_page_id`
- `analytics_api_key` (José override), `strategy_api_key` (Cláudio override)
- `research_api_key` (Pedro override), `visual_api_key` (Judite override)
- `anthropic_api_key` (Jarvis por tenant)
- `analysis_enabled`, `research_enabled`, `visual_enabled` (flags)

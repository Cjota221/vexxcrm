# Análise Completa — Anne IA
> Gerado em 04/04/2026 | VEXX CRM v2.0 | Leitura estática, sem alterações no código

---

## Resumo executivo

Anne IA é o motor de atendimento autônomo do VEXX CRM. Ela processa mensagens WhatsApp recebidas via FacilZap, detecta intenções via regex + LLM, roteia para 5 agentes especializados (Comercial, Logística, FAQ, Onboarding, Central), executa ações automáticas no sistema (Kanban, tags, envio de mensagens) e aciona handover humano em crises. Opera em dois modos: `auto` (responde diretamente) e `suggest` (propõe à operadora aprovar). É responsável por ~80% da automação de conversas do CRM.

---

## Arquivos onde a Anne está presente

### Rotas de API (src/app/api/)

| Caminho | O que faz |
|---------|-----------|
| `src/app/api/anne/chat/route.ts` | Chat direto com Anne via tool calling (OpenAI/Groq) |
| `src/app/api/anne/analyze/route.ts` | Análises inteligentes em batch ou individual |
| `src/app/api/anne/approve/route.ts` | Aprovação/rejeição de análises da Anne |
| `src/app/api/anne/feedback/route.ts` | Feedback de qualidade (1–5 stars) |
| `src/app/api/anne/segmentar/route.ts` | Segmentação de compradores por ticket médio |
| `src/app/api/anne/suggestions/[id]/route.ts` | Atualizar status de sugestão (sent/dismissed) |
| `src/app/api/anne/media-callback/route.ts` | Callback n8n para transcrição de áudio e descrição de imagens |
| `src/app/api/v2/anne/config/route.ts` | GET/PATCH configuração de automações e prompt mestre |
| `src/app/api/v2/anne/process/route.ts` | **Pipeline principal Anne OS v5.0** — webhook do FacilZap |
| `src/app/api/v2/anne/process-message/route.ts` | Motor de gatilhos com movimentação Kanban |
| `src/app/api/v2/anne/handover/route.ts` | Protocolo de crise: suspender automação, montar dossiê, SSE |
| `src/app/api/v2/anne/log/route.ts` | Log de gatilhos (anne_trigger_log) com stats 24h |
| `src/app/api/v2/anne/logs/route.ts` | Feed de execução v2 (anne_logs_v2) |
| `src/app/api/v2/anne/client-logs/[clientId]/route.ts` | Histórico de automação por cliente |
| `src/app/api/v2/anne/stats/route.ts` | KPIs: carrinhos, sugestões pendentes, automações do dia |
| `src/app/api/v2/anne/recovery-queue/process/route.ts` | Cron job de recuperação de carrinhos abandonados |
| `src/app/api/v2/anne/sandbox/route.ts` | Sandbox: simulação do pipeline SEM efeitos colaterais |
| `src/app/api/extension/anne/chat/route.ts` | Chat via Chrome Extension (CORS aberta) |

### Serviços e bibliotecas (src/lib/)

| Caminho | O que faz |
|---------|-----------|
| `src/lib/anne-prompt.ts` | Prompt padrão + injeção de variáveis dinâmicas do tenant |
| `src/lib/anne-triggers.ts` | Motor de gatilhos: regex + sentiment score + mapeamento para ações |
| `src/lib/services/anne-pipeline.ts` | Orquestrador Anne OS v5.0 — 7 etapas sequenciais |
| `src/lib/services/anne.service.ts` | Integração OpenAI/Groq (compatível com qualquer provider OpenAI-like) |
| `src/lib/services/anne-intelligence.ts` | Análises diagnósticas "Sentinela" (churn risk, oportunidades) |
| `src/lib/services/agent-executor.ts` | Execução dos 5 agentes especializados com knowledge base |

### Páginas e componentes (src/app/)

| Caminho | O que faz |
|---------|-----------|
| `src/app/(dashboard)/configuracoes/anne/page.tsx` | Dashboard de configuração: prompts, automações, sandbox, agentes |
| `src/app/(dashboard)/atendimento/page.tsx` | Re-export da página anne — acessível pelo menu "Anne IA" |

### Migrations (supabase/migrations/)

| Arquivo | O que cria |
|---------|-----------|
| `007_contact_center_anne_v3.sql` | Filas, departamentos, quick actions |
| `012_anne_config_columns.sql` | Colunas Anne em `tenants` |
| `015_anne_automations.sql` | `anne_automations`, `anne_recovery_queue` |
| `016_anne_os.sql` | `anne_agents`, `anne_logs_v2`, `anne_handovers` |
| `031_automation_suspended_ttl.sql` | Suspensão com TTL em `conversations` |
| `033_anne_suggestions.sql` | `anne_suggestions` |

---

## Rotas de API

### POST /api/v2/anne/process — Pipeline principal
- **Entrada:** `{ chat_id, message, from_me, client_id, message_id }`
- **Origem:** Webhook FacilZap (automático a cada mensagem recebida)
- **Fluxo:**
  1. Verificar se automação está suspensa para o chat
  2. Carregar perfil do cliente (pedidos, LTV, segmento RFM)
  3. Detectar crise → handover imediato se sim
  4. Classificar intenção: `COMERCIAL | LOGISTICA | INSTITUCIONAL | ONBOARDING | SISTEMA | AMBIGUO`
  5. Rotear para agente especialista
  6. Executar agente (LLM com knowledge base)
  7. Log completo + chain-of-thought
- **Retorno:** `{ handled, intent, agent_used, message_to_send, actions_taken, chain_of_thought, duration_ms }`

### POST /api/v2/anne/process-message — Motor de gatilhos
- **Entrada:** `{ contato_id, chat_id, conteudo, canal='whatsapp' }`
- **Ações possíveis:** mover Kanban, atualizar tag, aplicar etiqueta WhatsApp, log de auditoria
- **Retorno:** `{ gatilhos_disparados, acoes_executadas, escalona_para_humano, motivo }`

### POST /api/v2/anne/handover — Protocolo de crise
- **Entrada:** `{ chat_id, client_id?, motivo, palavra_gatilho?, score_sentimento? }`
- **Ações:** suspender automação, mover para ATENDIMENTO_HUMANO, montar dossiê, emitir SSE (badge vermelho)
- **Retorno:** `{ success, handover_id, automacao_suspensa, dossie_gerado }`

### GET/PATCH /api/v2/anne/config — Configuração
- **GET:** retorna `{ system_prompt, model, provider, send_mode, automations }`
- **PATCH body:** `{ system_prompt?, send_mode?, automations?: [{rule_key, enabled?, delay_minutes?, message_template?}] }`

### GET /api/v2/anne/recovery-queue/process — Cron de carrinhos
- **Auth:** `Bearer CRON_SECRET`
- **Função:** lê entradas com `due_at <= now()` e `status=pending`, envia mensagem, marca como `sent`

### POST /api/v2/anne/sandbox — Testes
- **Entrada:** `{ text: string, from_me?: boolean }`
- **Execução:** pipeline completo SEM efeitos colaterais (não envia mensagens, não move Kanban)
- **Retorno:** `{ intent, agent_used, message_suggestion, chain_of_thought, is_crisis, duration_ms }`

### POST /api/anne/chat — Chat direto
- **Entrada:** `{ message: string, context?: { client_id?, chat_history? } }`
- **Provider:** OpenAI ou Groq (configurável por tenant)
- **Tool calling:** até 5 iterações com tools: `buscar_clientes`, `disparar_campanha`, etc.

---

## Triggers e automações

### Quando a Anne é acionada

| Origem | Rota | Frequência |
|--------|------|-----------|
| FacilZap webhook (mensagem recebida) | `/api/v2/anne/process` | A cada mensagem |
| FacilZap webhook (evento de sistema) | `/api/v2/anne/process-message` | A cada evento |
| Cron job (carrinhos) | `/api/v2/anne/recovery-queue/process` | Agendado |
| Cron job (ghosting) | `/api/cron/ghosting-check` | Agendado |
| n8n webhook (mídia) | `/api/anne/media-callback` | Por mídia recebida |
| Manualmente (operadora) | `/api/anne/chat` | Sob demanda |
| Chrome Extension | `/api/extension/anne/chat` | Sob demanda |

### Motor de gatilhos (anne-triggers.ts)

Detecta eventos via **regex** e atribui **score de confiança**:

| Gatilho | Padrão | Score | Ação |
|---------|--------|-------|------|
| `pedido_recebido` | `/pedido\s?#?\d+/i` | 0.95 | Kanban → AGUARDANDO_PAGAMENTO |
| `pagamento_aprovado` | `/pagamento\s*(aprovado\|confirmado)/i` | 0.93 | Kanban → PAGO |
| `primeiro_contato` | `/\b(olá\|oi\|bom dia)/i` | 1.0 | Kanban → PRIMEIRO_CONTATO |
| `sinal_rejeicao` | `/\b(cancelar\|reembolso\|estorno)/i` | 0.82 | Tag: risco_churn + escalação |
| `engajamento_alto` | `/\b(quero\|preciso\|interesse)/i` | 0.60–1.0 | Tag: lead_quente |
| `ghosting` | Ausência de resposta | 1.0 | Kanban → REATIVAR |

**Threshold de execução:**
- Score ≥ 0.90 → Ação automática imediata
- Score 0.70–0.89 → Ação automática + marcado para revisão
- Score < 0.70 → Apenas sugestão para operadora

### Detecção de crises

Keywords que disparam handover imediato:
`defeito`, `problema`, `estorno`, `reembolso`, `cancelar`, `reclamação`, `processo`, `advogado`, `procon`, `absurdo`, `inaceitável`, + 3 ou mais `!!!`, + texto em CAPS

### Automações agendadas padrão

| rule_key | Delay | Modo | Template |
|----------|-------|------|----------|
| `cart_recovery` | 120 min | suggest | Recuperação de carrinho |
| `welcome_lead` | 0 min | suggest | Boas-vindas |
| `payment_confirm` | 0 min | **auto** | Confirmação de pagamento |
| `tracking_reply` | 0 min | **auto** | Resposta de rastreio |

---

## Comportamentos na Central de Atendimento

### Fluxo de mensagem recebida

```
Mensagem WhatsApp → FacilZap → POST /api/v2/anne/process
    ↓
[1] Perfil suspensa? → ignorar e não responder
[2] Carregar cliente: pedidos, LTV, segmento RFM, tags
[3] Detectar crise → se sim: handover imediato (SSE + badge vermelho)
[4] Classificar intenção (COMERCIAL / LOGISTICA / FAQ / ONBOARDING / AMBIGUO)
[5] Rotear para agente especialista + executar LLM com knowledge base
[6] Gerar resposta
[7] Modo 'auto' → enviar direto (delay 2–5s humanizado)
    Modo 'suggest' → inserir em anne_suggestions para operadora aprovar
[8] Log em anne_logs_v2 com chain-of-thought
```

### Os 5 agentes especializados

| Agente | Intenção | Capacidade |
|--------|----------|------------|
| **Comercial** | COMERCIAL | Preços, promoções, upsell, catálogo |
| **Logística** | LOGISTICA | Rastreio, prazo, transportadora |
| **FAQ** | INSTITUCIONAL | Endereço, horário, CNPJ, redes |
| **Onboarding** | ONBOARDING | Coleta de nome, canal de venda, primeira compra |
| **Central** | AMBIGUO | Fallback genérico — LLM puro |

### Movimentação do Kanban

```
NOVO → PRIMEIRO_CONTATO → AGUARDANDO_PAGAMENTO → PAGO → DESPACHADO → CONCLUIDO
         ↑                                                              ↓
         └──────────── REATIVAR ←────────── GHOSTING ─────────────────┘
                          ↕
                   ATENDIMENTO_HUMANO (crise)
```

Cada transição:
- É validada (state machine — impede loops)
- Registrada em `kanban_transitions` com motivo e score
- Atualiza tag e etiqueta WhatsApp correspondente

### Cards de sugestão (Modo suggest)

A operadora vê um card com:
- Mensagem proposta pela Anne (truncada, expandível)
- % de confiança
- Botão **Enviar** → `PATCH /api/anne/suggestions/[id]` status=sent
- Botão **Editar** → texto vai para o campo de digitação
- Botão **X** → descartado (status=dismissed)

---

## Configurações atuais

### Modelo e provedor

| Campo | Padrão | Opções |
|-------|--------|--------|
| `openai_model` | `gpt-4o-mini` | gpt-4o, gpt-4-turbo, llama-3.3-70b-versatile, mixtral-8x7b |
| `openai_provider` | `openai` | `openai` \| `groq` |
| `openai_api_key` | `null` | **Obrigatório** |
| `openai_base_url` | `null` | URLs customizadas (Azure, DeepSeek, etc.) |
| `anne_send_mode` | `suggest` | `auto` \| `suggest` |
| `openai_system_prompt` | `null` → usa padrão | Personalizável por tenant |

### System prompt padrão (DEFAULT_ANNE_PROMPT)

- **Tom:** próxima, ágil, sem formalidade — moda/varejo feminino
- **Emojis:** moderados (`✅ 🛍️ 💳 🚀`)
- **Limite:** máximo 3 parágrafos por resposta
- **Idioma:** sempre português brasileiro
- **Segmentos RFM:** VIP (trato especial), New (onboarding), At Risk (reconquista), Indeciso (sugerir catálogo)
- **Restrições absolutas:** não inventar cupons, não expor dados sensíveis, não inventar rastreios

### Tabelas de configuração

**`tenants`:** `openai_api_key`, `openai_model`, `openai_provider`, `openai_base_url`, `openai_system_prompt`, `anne_send_mode`

**`anne_automations`:** `rule_key`, `enabled`, `delay_minutes`, `send_mode`, `message_template`

**`anne_agents`:** `slug`, `name`, `description`, `system_prompt`, `knowledge_base`, `knowledge_tokens`, `enabled`

---

## Dependências

### Tabelas de banco (o que se perde)

| Tabela | Impacto |
|--------|---------|
| `anne_automations` | Regras de automação |
| `anne_recovery_queue` | Fila de carrinhos abandonados |
| `anne_agents` | Knowledge base dos 5 agentes |
| `anne_logs_v2` | Auditoria + chain-of-thought de toda conversa |
| `anne_handovers` | Histórico de crises e handovers |
| `anne_trigger_log` | Log de todos os gatilhos disparados |
| `anne_suggestions` | Sugestões pendentes de aprovação |

### Integrações externas que param

- **FacilZap webhook** → sem Anne, nenhuma mensagem é processada automaticamente
- **n8n webhook** → transcrição de áudio e descrição de imagens param
- **Evolution API** → sem Anne, nenhuma resposta automática é enviada
- **Chrome Extension** → assistente dentro do WhatsApp Web para

### Funcionalidades que param

- Movimentação automática do Kanban
- Detecção de pagamentos e rastreio
- Recuperação de carrinhos abandonados
- Detecção de crises com handover
- Cards de sugestão para operadora
- Análises diagnósticas de clientes (Sentinela)
- Segmentação RFM automática
- Cron de reativação de ghosting

---

## Recomendação para substituição pelo Jarvis

### Diferença fundamental

| | Anne | Jarvis |
|--|------|--------|
| Foco | Atendimento WhatsApp em tempo real | Estratégia, campanhas, análise |
| Latência | < 1 segundo (obrigatório) | Segundos (aceitável) |
| Entrada | Mensagem de cliente | Comando do gestor |
| Output | Resposta ao cliente | Insight / ação de campanha |
| Agentes | 5 especializados por intenção | 1 estrategista geral |

### Anne NÃO deve ser substituída pelo Jarvis para atendimento

São ferramentas complementares:
- **Anne** → processa conversas WhatsApp (velocidade, escala, automação)
- **Jarvis** → apoia decisões de negócio (campanhas, análise, estratégia)

### O que o Jarvis pode absorver da Anne

| Capacidade da Anne | Como migrar para Jarvis |
|-------------------|------------------------|
| Análises diagnósticas (Sentinela) | Jarvis acessa `anne_logs_v2` e gera insights |
| Segmentação RFM | Jarvis consulta banco e recomenda ações de campanha |
| Relatório de performance | Jarvis compila dados de `anne_logs_v2` + `meta_campaigns_cache` |
| Sugestões de copy | Jarvis gera copies baseado em histórico de campanhas |
| Identificar crises | Jarvis monitora `anne_handovers` e alerta no chat |

### Plano de convivência recomendado

1. **Manter Anne** para atendimento WhatsApp (substituição não é recomendada)
2. **Expandir Jarvis** com acesso de leitura às tabelas Anne para contexto
3. **Integrar no chat do Jarvis:** comandos como "me mostre os handovers de hoje", "analise as conversas da semana"
4. **Longo prazo:** Jarvis decide estratégia → Anne executa no WhatsApp

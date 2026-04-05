# Analise Completa -- Anne IA no VEXX CRM

## Resumo executivo

Anne IA e um agente autonomo de vendas e atendimento integrado ao WhatsApp via Evolution API. Opera como um sistema multi-agente (Anne OS v5.0) com 4 agentes especializados (comercial, logistica, FAQ, triagem), pipeline de 7 estagios, deteccao de crise com handover para humanos, e uma camada de inteligencia autonoma (Sentinela v3) que detecta churn, upsell e oportunidades sazonais. Suporta dois provedores de IA (OpenAI gpt-4o-mini e Groq llama-3.3-70b) e opera em modo automatico ou sugestao (human-in-the-loop).

---

## Arquivos onde a Anne esta presente

### Servicos Core (10 arquivos)

| Arquivo | Descricao |
|---------|-----------|
| `src/lib/services/anne.service.ts` | Interface de chat compativel com OpenAI — funcao principal `chat()` |
| `src/lib/services/groq.service.ts` | Integracao Groq (fetch direto, sem SDK) — `groqChat()` e `groqComplete()` |
| `src/lib/anne-prompt.ts` | System prompt padrao + injecao de variaveis dinamicas (nome_loja, segmento_rfm, etc.) |
| `src/lib/anne-triggers.ts` | Deteccao de gatilhos por regex + scoring (primeiro_contato, pagamento_aprovado, ghosting, etc.) |
| `src/lib/anne-pipeline.ts` | Orquestracao do pipeline de 7 estagios (normalizar, classificar, rotear, executar, logar) |
| `src/lib/services/anne-auto-reply.ts` | Processador do webhook — throttle 30s, modos auto/suggest, envio via Evolution |
| `src/lib/services/anne-intelligence.ts` | Sentinela v3 — analise autonoma de churn, upsell, win-back |
| `src/lib/services/agent-executor.ts` | Executor dos 4 agentes especializados (comercial/logistica/faq/triagem) |
| `src/lib/pipeline-triggers.ts` | Execucao de triggers com maquina de estados do kanban |
| `src/lib/anne/tools/index.ts` | Tool calling para operadores (buscar_clientes, segmentar, disparar_campanha) |

### Rotas de API (14 rotas)

| Arquivo | Descricao |
|---------|-----------|
| `src/app/api/v2/anne/process/route.ts` | Handler principal do webhook — pipeline completo |
| `src/app/api/v2/anne/process-message/route.ts` | Engine de triggers — detecta padroes e move kanban |
| `src/app/api/v2/anne/config/route.ts` | CRUD de configuracoes (prompt, modelo, modo, automacoes) |
| `src/app/api/v2/anne/handover/route.ts` | Protocolo de crise — suspende automacao, gera dossie |
| `src/app/api/v2/anne/stats/route.ts` | Estatisticas em tempo real |
| `src/app/api/v2/anne/log/route.ts` | Consulta logs de execucao |
| `src/app/api/v2/anne/client-logs/[clientId]/route.ts` | Historico por cliente |
| `src/app/api/v2/anne/recovery-queue/process/route.ts` | Fila de recuperacao de carrinho |
| `src/app/api/v2/anne/sandbox/route.ts` | Teste de triggers sem efeitos colaterais |
| `src/app/api/anne/chat/route.ts` | Chat operador com tool calling |
| `src/app/api/anne/analyze/route.ts` | Analise batch da Sentinela |
| `src/app/api/anne/approve/route.ts` | Aprovacao de recomendacoes + geracao de cupom |
| `src/app/api/anne/feedback/route.ts` | Feedback pos-execucao (score 1-5) |
| `src/app/api/anne/segmentar/route.ts` | Segmentacao por RFM/LTV/frequencia |
| `src/app/api/anne/suggestions/[id]/route.ts` | Marca sugestao como enviada/descartada |
| `src/app/api/anne/media-callback/route.ts` | Callback de midia da Evolution API |
| `src/app/api/extension/anne/chat/route.ts` | Chat via extensao do navegador |

### Componentes React (4 arquivos)

| Arquivo | Descricao |
|---------|-----------|
| `src/components/anne/AnnePanel.tsx` | Interface de chat operador <-> Anne |
| `src/components/anne/AnneFAB.tsx` | Botao flutuante para abrir o painel |
| `src/components/chat/AnneSuggestionCard.tsx` | Card de sugestao no chat |
| `src/components/contact-center/SentinelaAnnePanel.tsx` | Painel de analise autonoma |

### Hooks (2 arquivos)

| Arquivo | Descricao |
|---------|-----------|
| `src/hooks/useAnne.ts` | Mutation de chat operador |
| `src/hooks/useAnneSuggestion.ts` | Polling de sugestoes pendentes |

### Configuracao (1 arquivo)

| Arquivo | Descricao |
|---------|-----------|
| `src/app/(dashboard)/configuracoes/anne/page.tsx` | UI de configuracoes (prompt, modelo, modo, automacoes, agentes) |

### Tipos (1 arquivo)

| Arquivo | Descricao |
|---------|-----------|
| `src/types/index.ts` | Interfaces: AnneTriggerType, AnneActionType, AnneTriggerResult |

---

## Rotas de API — Detalhamento

### POST `/api/v2/anne/process`
- **Recebe**: `{ tenantId, clientId, conversationId, remoteJid, message, clientPhone }`
- **Retorna**: `{ ok, agente, intent, mensagem, acoes }`
- **Chamada por**: Webhook Evolution API (fire-and-forget via `processAutoReply()`)
- **Pipeline**: L0 normalizar -> L1 carregar perfil -> L2 detectar crise -> L3 classificar intent -> L4 rotear agente -> L5 executar -> L6 logar + enviar/sugerir

### POST `/api/v2/anne/process-message`
- **Recebe**: `{ tenantId, clientId, conversationId, message, direction }`
- **Retorna**: `{ triggers_detected, actions_taken }`
- **Chamada por**: Webhook apos salvar mensagem
- **Funcao**: Detecta padroes (primeiro_contato, pagamento, rejeicao, engajamento) e executa acoes (mover kanban, aplicar tag, notificar)

### GET/PATCH `/api/v2/anne/config`
- **GET retorna**: `{ system_prompt, model, provider, send_mode, automations[], agents[] }`
- **PATCH recebe**: Campos parciais para atualizar
- **Chamada por**: Pagina de configuracoes `/configuracoes/anne`

### GET/POST/PATCH `/api/v2/anne/handover`
- **POST recebe**: `{ conversationId, motivo, palavraGatilho }`
- **POST retorna**: `{ handoverId, dossie }`
- **Funcao**: Suspende automacao, move para fila humana, gera dossie de contexto (historico, pedidos, LTV, flags)

### POST `/api/anne/chat`
- **Recebe**: `{ message, history[], context }`
- **Retorna**: `{ response, tool_calls[] }`
- **Chamada por**: AnnePanel.tsx (operador conversando com Anne)
- **Tools disponiveis**: buscar_clientes_pedido_alto, segmentar_compradores, disparar_campanha_whatsapp

### GET/POST `/api/anne/analyze`
- **POST recebe**: `{ clientIds[], analysisTypes[] }`
- **POST retorna**: `{ analyses[] }` com tipo (churn_risk/upsell/win_back/seasonal/cross_sell/new_customer_nurture), urgencia, confianca, recomendacao
- **Chamada por**: SentinelaAnnePanel.tsx

### POST `/api/anne/approve`
- **Recebe**: `{ analysisId, action }`
- **Retorna**: `{ ok, coupon? }`
- **Funcao**: Aprova recomendacao da Sentinela e gera cupom personalizado se necessario

---

## Triggers e automacoes

### Triggers por mensagem (tempo real)

| Trigger | Deteccao | Score | Acao | Kanban |
|---------|----------|-------|------|--------|
| `primeiro_contato` | Primeira mensagem na conversa | 1.0 | Mover kanban, tag `lead_novo`, label "Novo Lead" | -> NOVO_CONTATO |
| `pedido_recebido` | Regex: `pedido #\d+` | 0.95 | Mover kanban, tag `aguardando_pgt`, template, notificar | -> AGUARDANDO_PGT |
| `pagamento_aprovado` | Regex: `pagamento (aprovado\|confirmado\|pago)` | 0.93 | Mover kanban, tag `cliente_pago`, notificar | -> PAGO |
| `sinal_rejeicao` | Regex: `(nao posso\|desistir\|cancelar\|reembolso)` | 0.82 | Tag `risco_churn`, label "Em Risco", escalar para humano | Mantem atual |
| `engajamento_alto` | Keywords de sentimento positivo | 0.6-1.0 | Tag `lead_quente`, label "Lead Quente", template | Mantem atual |

### Trigger por cron (ghosting)

- Roda a cada hora
- Detecta conversas sem interacao por 3+ dias
- Se < 3 tentativas de reativacao: move para REATIVAR
- Se 3+ tentativas esgotadas: move para CONCLUIDO com tag `sem_retorno`
- Colunas imunes: PAGO, CONCLUIDO

### Automacoes configuradas

| Regra | Trigger | Delay | Modo | Mensagem |
|-------|---------|-------|------|----------|
| `cart_recovery` | Cliente em EM_NEGOCIACAO por 120min sem pagamento | 120min | Suggest | "Notamos que suas pecas ainda estao te esperando" |
| `welcome_lead` | Primeiro contato detectado | 0min | Suggest | "Ola! Seja bem-vinda a {{loja}}!" |
| `payment_confirm` | Pagamento detectado | 0min | Auto | "Confirmado! Seu pedido ja esta sendo separado." |
| `tracking_reply` | Cliente pergunta rastreio | 0min | Auto | "Seu codigo: {{codigo_rastreio}}" |

### Ponto de entrada do webhook

```
Evolution API (messages.upsert)
  -> POST /api/webhooks/evolution?tenant_id=xxx
    -> handleNewMessage() em evolution/route.ts (linha 625)
      -> fire-and-forget processAutoReply()
        -> Anne OS v5.0 Pipeline (7 estagios)
```

---

## Comportamentos na Central de Atendimento

### Auto-resposta
- Quando `anne_send_mode='auto'`: envia mensagens diretamente via WhatsApp
- Quando `anne_send_mode='suggest'`: cria sugestao para operador aprovar
- Throttle de 30 segundos por chat (previne spam)

### Classificacao
- Classifica intent automaticamente: COMERCIAL / LOGISTICA / INSTITUCIONAL / ONBOARDING / SISTEMA / AMBIGUO
- Atribui segmento RFM + temperatura do lead (quente/morno/frio)
- Atualiza labels do WhatsApp dinamicamente

### Movimento de kanban
- Move cards baseado em triggers detectados
- Validacao via maquina de estados (transicoes validas)
- Preserva prioridade e metadata dos cards

### Triagem de leads
- Qualifica novos leads como quente/morno/frio
- Aplica tags automaticas (lead_quente, lead_morno, lead_frio)
- Sugere proximos passos aos operadores

### Mensagens proativas (Sentinela v3)
- Analisa clientes automaticamente
- Detecta risco de churn, oportunidades de upsell, momentos sazonais
- Gera recomendacoes (enviar mensagem, gerar cupom, criar campanha, agendar followup)
- Operadores aprovam/rejeitam com feedback loop

### Handover inteligente
- Detecta palavras de crise: defeito, reclamacao, reembolso, procon, etc.
- Dispara handover imediato para agente humano
- Gera dossie de contexto (historico, pedidos abertos, LTV, flags)
- Suspende automacao da conversa com TTL

---

## Configuracoes atuais

### Provedores de IA

| Provider | Base URL | Modelo padrao |
|----------|----------|---------------|
| OpenAI | `https://api.openai.com/v1` | gpt-4o-mini |
| Groq | `https://api.groq.com/openai/v1` | llama-3.3-70b-versatile |

### Configuracao no banco

Tabela `tenants`:
- `openai_api_key` — chave da API
- `openai_model` — modelo em uso
- `openai_provider` — 'openai' ou 'groq'
- `openai_base_url` — endpoint customizado
- `openai_system_prompt` — prompt personalizado
- `anne_send_mode` — 'auto' ou 'suggest'

### System prompt padrao

Definido em `src/lib/anne-prompt.ts` com secoes:
- **Missao**: Converter vendas, recuperar pedidos, sugerir produtos, fidelizar
- **Tom**: Casual, emojis, portugues brasileiro, respostas diretas (max 3 paragrafos)
- **Foco Pedidos**: Status de pagamento, incentivar conclusao, rastreio
- **Inteligencia de Venda**: Consciencia do segmento RFM (Champions/Loyal/At Risk/Hibernating)
- **Restricoes**: Nao inventar descontos, nao expor dados, nao alucinar

### Variaveis dinamicas do prompt

- `{{nome_loja}}` — nome do tenant
- `{{nome_atendente}}` — operador logado
- `{{link_catalogo}}` — URL do catalogo
- `{{segmento_rfm}}` — segmento do cliente
- `{{nome_cliente}}` — nome do cliente atual

---

## Tabelas no banco de dados

| Tabela | Migration | Funcao |
|--------|-----------|--------|
| `tenants` (colunas Anne) | `012_anne_config_columns.sql` | Config de modelo/provider/prompt/modo |
| `anne_automations` | `015_anne_automations.sql` | Regras de automacao (cart_recovery, welcome, etc.) |
| `anne_agents` | `016_anne_os.sql` | Agentes especializados (slug, prompt, knowledge_base) |
| `anne_logs_v2` | `016_anne_os.sql` | Log completo de execucao (tipo, agente, gatilho, confianca, acoes, chain_of_thought, duracao) |
| `anne_handovers` | `016_anne_os.sql` | Registros de handover (motivo, dossie, status, assumido_por) |
| `anne_recovery_queue` | `015_anne_automations.sql` | Fila de recuperacao de carrinho |
| `anne_suggestions` | `033_anne_suggestions.sql` | Sugestoes para operadores (pending/sent/dismissed) |
| `sentinela_analyses` | `007_contact_center_anne_v3.sql` | Analises autonomas (churn/upsell/win_back/seasonal) |
| `sentinela_coupons` | `007_contact_center_anne_v3.sql` | Cupons personalizados gerados |
| `sentinela_learning_log` | `007_contact_center_anne_v3.sql` | Feedback loop de aprendizado |
| `conversations` (colunas Anne) | — | `automacao_suspensa`, `automacao_suspensa_motivo`, `automacao_suspensa_ate` |

---

## Dependencias — O que quebra se a Anne for removida

### Critico
1. **Webhook WhatsApp** — `processAutoReply()` em `/api/webhooks/evolution` para de funcionar; nenhuma auto-resposta
2. **Automacao do kanban** — Cards nao se movem automaticamente nos triggers
3. **Labels do WhatsApp** — Nao sao atualizadas automaticamente
4. **Recuperacao de carrinho** — Fila de recovery para de processar

### Importante
5. **Sentinela** — Nenhum alerta de churn/upsell gerado
6. **Cupons** — Nao sao gerados automaticamente
7. **Handover de crise** — Deteccao automatica de palavras de crise para de funcionar
8. **Sugestoes ao operador** — Painel de sugestoes fica vazio

### Cosmético
9. **Badge de stats** — Contador de automacoes no header desaparece
10. **Pagina de configuracoes** — `/configuracoes/anne` fica sem funcionalidade

---

## Recomendacao para substituicao pelo Jarvis

### O que precisa ser replicado

1. **Mesmo ponto de entrada no webhook** — modificar `processAutoReply()` em `/api/webhooks/evolution` ou criar handler paralelo
2. **Classificacao de intent** — COMERCIAL / LOGISTICA / INSTITUCIONAL / ONBOARDING / SISTEMA / AMBIGUO
3. **Roteamento de agentes** — funcao `routeToAgent()` com 4 agentes especializados
4. **Deteccao de crise** — keywords + analise de sentimento
5. **Integracao com kanban** — maquina de estados, transicoes validas
6. **Aplicacao de labels WhatsApp** — via Evolution API
7. **Processador de fila de recuperacao** — cart recovery com delay
8. **Logging** — tabela `anne_logs_v2` (ou renomear)
9. **Protocolo de handover** — suspensao de automacao, dossie, TTL
10. **Tool calling** — buscar_clientes, segmentar, disparar_campanha
11. **Motor de analise Sentinela** — regras de churn/upsell
12. **UI de configuracao** — editar em `/configuracoes/`

### O que pode ser melhorado

1. **Throttle com Redis** em vez de query no banco
2. **Cache de classificacao** de mensagens frequentes
3. **Deteccao de crise com ML** em vez de keywords fixas
4. **Suporte a mais modelos Groq** (mixtral, llama-2)
5. **A/B testing** para regras de automacao
6. **Deduplicacao de mensagens** (prevenir auto-replies duplicadas)
7. **Sumarizacao de conversas longas** antes de enviar ao LLM

### Estrategia de migracao sugerida

1. Manter schema da Anne intacto (aliasing)
2. Implementar servicos Jarvis com mesma interface: `chat()`, `detectIntent()`, `classifyTemperature()`
3. Criar feature flag: `USE_JARVIS_FOR_AUTO_REPLY`
4. Rotear webhook para novo handler Jarvis enquanto Anne permanece como fallback
5. Logar predicoes de ambos por 2 semanas (shadow analysis)
6. Cutover trocando a feature flag

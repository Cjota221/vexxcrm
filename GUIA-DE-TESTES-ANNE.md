# Guia de Testes — Anne IA

## A. Throttle (Anti-spam 30s)

### A1. Bloqueio de resposta dentro da janela de throttle
- **Cenário:** Cliente envia mensagem durante a janela de 30s após resposta anterior
- **Pré-condição:** Chat com automação ativa, última resposta em `anne_logs_v2` há 5 segundos
- **Passos:**
  1. Enviar mensagem nova
  2. Verificar logs em `anne_logs_v2` (tipo='ativa')
  3. Enviar outra mensagem após 5 segundos
- **Resultado esperado:** Segunda chamada retorna imediatamente sem processar, sem gerar novo log `tipo='ativa'`

### A2. Permitir resposta após expiração do throttle
- **Cenário:** Segunda mensagem chega após 31 segundos
- **Pré-condição:** Última resposta registrada há 31s em `anne_logs_v2`
- **Passos:**
  1. Enviar mensagem 1, aguardar 31s
  2. Enviar mensagem 2
  3. Verificar logs
- **Resultado esperado:** Segunda resposta é processada e gera novo log `tipo='ativa'`

### A3. Persistência de throttle em ambientes serverless
- **Cenário:** Múltiplas invocações em Netlify com processos isolados
- **Pré-condição:** `anne_logs_v2` como fonte de verdade (sem state em memória)
- **Passos:**
  1. Simular 2 webhook calls simultâneas em intervalo de 3s
  2. Consultar `anne_logs_v2`
- **Resultado esperado:** Apenas uma chamada gera `tipo='ativa'`; a segunda é bloqueada por `isThrottled()`

---

## B. Automação Suspensa (TTL)

### B1. Suspensão permanente manual
- **Cenário:** Operadora suspende automação indefinidamente
- **Pré-condição:** `automacao_suspensa=true, automacao_suspensa_ate=null`
- **Passos:**
  1. Enviar mensagem ao cliente
  2. Chamar `processAutoReply()`
  3. Verificar log
- **Resultado esperado:** Função retorna sem processar, sem gerar log

### B2. Suspensão com TTL: reativação automática
- **Cenário:** Suspensão temporária expirada há 1h
- **Pré-condição:** `automacao_suspensa=true, automacao_suspensa_ate` = 1h no passado
- **Passos:**
  1. Chamar `isAutomationSuspended()`
  2. Verificar valores do chat após chamada
- **Resultado esperado:** Retorna `false`, `automacao_suspensa` resetado para `false`, `automacao_suspensa_ate=null`

### B3. TTL ainda em vigor — bloqueio de automação
- **Cenário:** Suspensão com TTL válido por mais 30 min
- **Pré-condição:** `automacao_suspensa=true, automacao_suspensa_ate` = 30 min no futuro
- **Passos:**
  1. Chamar `isAutomationSuspended()`
  2. Tentar processar resposta
- **Resultado esperado:** Retorna `true`, pipeline interrompido, sem log `tipo='ativa'`

---

## C. Modos de Envio: Auto vs Suggest

### C1. Modo Auto: envio direto via WhatsApp
- **Cenário:** Tenant com `anne_send_mode='auto'`
- **Pré-condição:** Config carregada, `send_mode='auto'`
- **Passos:**
  1. Mensagem do cliente disparar pipeline
  2. Agent gera resposta `tipo='mensagem'`
  3. Verificar Evolution API call e tabela `messages`
  4. Verificar evento SSE/eventBus
- **Resultado esperado:** Mensagem salva em `messages` (`direction='outbound'`), enviada via `sendTextMessage()`, evento `new_message` emitido

### C2. Modo Suggest: sugestão persistida no banco
- **Cenário:** Tenant com `anne_send_mode='suggest'`
- **Pré-condição:** Config carregada, `send_mode='suggest'`
- **Passos:**
  1. Mensagem do cliente disparar pipeline
  2. Agent gera resposta
  3. Verificar tabela `anne_suggestions`
  4. Verificar eventBus emit
- **Resultado esperado:** Registro inserido em `anne_suggestions` com `status='pending'`, evento `anne_suggestion` emitido

### C3. Delay humano aplicado apenas no modo Auto
- **Cenário:** Modo Auto com delay 2–5s
- **Pré-condição:** `send_mode='auto'`
- **Passos:**
  1. Registrar timestamp antes de chamar resposta
  2. Registrar timestamp após envio WhatsApp
  3. Calcular diferença
- **Resultado esperado:** Diferença entre 2–5 segundos (`humanDelay`)

---

## D. AnneSuggestionCard (UI)

### D1. Exibição de sugestão pendente
- **Cenário:** Nova sugestão inserida no banco; frontend carrega via realtime
- **Pré-condição:** `useAnneSuggestion(conversationId)` ativo, realtime subscrito
- **Passos:**
  1. Inserir sugestão em `anne_suggestions` (`status='pending'`)
  2. Aguardar notificação Realtime
  3. Verificar hook retorna sugestão
- **Resultado esperado:** Card renderiza com ícone Sparkles, mensagem, confiança e botões Enviar/Editar/X

### D2. Envio direto da sugestão via botão
- **Cenário:** Operadora clica botão Enviar no card
- **Pré-condição:** Card renderizado com sugestão
- **Passos:**
  1. Clicar botão **Enviar**
  2. Chamar `updateStatus({id, status: 'sent'})`
  3. Verificar PATCH `/api/anne/suggestions/[id]`
- **Resultado esperado:** Status atualizado para `'sent'`, card desaparece do UI

### D3. Edição de sugestão no input
- **Cenário:** Operadora clica **Editar**; texto vai para o input
- **Pré-condição:** Card renderizado
- **Passos:**
  1. Clicar **Editar**
  2. Verificar texto no `MessageInput`
- **Resultado esperado:** Texto da sugestão aparece no input; operadora pode modificar antes de enviar manualmente

### D4. Descarte de sugestão
- **Cenário:** Operadora clica X para descartar
- **Passos:**
  1. Clicar X (dismiss)
  2. Verificar PATCH com `status: 'dismissed'`
- **Resultado esperado:** Card desaparece, status no banco atualizado

### D5. Expansão de mensagem longa (>120 chars)
- **Pré-condição:** Sugestão com mais de 120 caracteres
- **Passos:**
  1. Verificar preview truncado com "…"
  2. Clicar botão expand/chevron
- **Resultado esperado:** Texto completo exibido; ícone alterna entre expandido/recolhido

---

## E. Qualificação de Leads (Hot/Warm/Cold)

### E1. Classificação Hot (lead quente)
- **Cenário:** Cliente menciona preço, pedido ou compra explícita
- **Passos:**
  1. Mensagem: "Qual o preço do produto X?"
  2. Chamar `qualifyLead()` com LLM
  3. Verificar temperatura e label
- **Resultado esperado:** `temperature='hot'`, label `lead_quente` aplicado, tags do cliente atualizadas

### E2. Classificação Warm (lead morno)
- **Cenário:** Cliente engajado mas sem intenção clara de compra
- **Passos:**
  1. Mensagem: "Vocês têm isso em cor azul?"
  2. Verificar temperatura
- **Resultado esperado:** `temperature='warm'`, label `lead_morno` aplicado

### E3. Classificação Cold (lead frio)
- **Cenário:** Primeira saudação, sem contexto de compra
- **Passos:**
  1. Mensagem: "Olá, tudo bem?"
  2. Verificar temperatura
- **Resultado esperado:** `temperature='cold'`, label `lead_frio` aplicado

### E4. Remoção de labels antigos ao atualizar tier
- **Pré-condição:** Cliente tem tag `lead_frio`
- **Passos:**
  1. Qualificar mensagem cold → tag `lead_frio` aplicada
  2. Enviar mensagem hot ("quero comprar")
  3. Qualificar novamente
  4. Verificar tags do cliente
- **Resultado esperado:** Tag `lead_frio` removida; apenas `lead_quente` persiste

---

## F. Busca Full-Text em Mensagens

### F1. Coluna TSVECTOR gerada automaticamente
- **Pré-condição:** Migration 034 aplicada
- **Passos:**
  1. Inserir mensagem: `content='Cliente quer rastreio do pedido'`
  2. Consultar `search_vector` da mensagem
- **Resultado esperado:** `search_vector` preenchido automaticamente com tokens em português

### F2. Busca simples via API
- **Passos:**
  1. `GET /api/messages/search?q=rastreio`
  2. Verificar resultados
- **Resultado esperado:** Mensagens contendo "rastreio" (e variações pela stemização) retornadas

### F3. Fallback ILIKE quando migration não foi executada
- **Pré-condição:** Coluna `search_vector` ausente
- **Passos:**
  1. `GET /api/messages/search?q=rastreio`
  2. Verificar campo `fallback` na resposta
- **Resultado esperado:** `{ fallback: true, hint: 'Execute a migration 034...' }`

### F4. Busca multi-palavra (AND implícito)
- **Passos:**
  1. `GET /api/messages/search?q=pedido+rastreio`
- **Resultado esperado:** Apenas mensagens contendo AMBAS as palavras

---

## G. Agentes (Comercial, Logística, FAQ, Onboarding, Central)

### G1. Agente Comercial: resposta com preço
- **Passos:**
  1. Mensagem: "Qual o preço mínimo?"
  2. `classifyIntent()` → `'COMERCIAL'`
  3. `runCommercialAgent()` executa
- **Resultado esperado:** Resposta com informação de preço, `confianca >= 0.75`, `tipo='mensagem'`

### G2. Agente Logística: vinculação de código de rastreio
- **Passos:**
  1. Mensagem: "Meu código é AA123456789BR"
  2. `runLogisticsAgent()` detecta e vincula
  3. Verificar `orders` e `kanban_cards`
- **Resultado esperado:** Código vinculado, kanban movido para `'DESPACHADO'`, log registrado

### G3. Agente FAQ: resposta institucional
- **Passos:**
  1. Mensagem: "Qual o endereço de vocês?"
  2. `classifyIntent()` → `'INSTITUCIONAL'`
  3. `runFAQAgent()` executa
- **Resultado esperado:** Resposta com endereço, `confianca >= 0.70`

### G4. Agente Onboarding: extração de nome e canal de venda
- **Pré-condição:** Cliente sem `onboarding_concluido`
- **Passos:**
  1. Mensagem: "Meu nome é João, vendo online"
  2. `runOnboardingAgent()` executa
  3. Verificar `clients.name` e `canal_venda`
- **Resultado esperado:** Nome e canal_venda salvos; `onboarding_concluido=true`

### G5. Agente Central: fallback genérico
- **Passos:**
  1. Mensagem ambígua: "123 abc xyz"
  2. `classifyIntent()` → `'AMBIGUO'`
  3. `runCentralAgent()` executa
- **Resultado esperado:** Resposta genérica de esclarecimento, `confianca=0.60–0.75`

---

## H. Detecção de Crise

### H1. Detecção por palavra-chave
- **Passos:**
  1. `detectCrisis('Meu produto tem defeito!')`
- **Resultado esperado:** `{ isCrisis: true, trigger: 'defeito', score: ≥ 0.90 }`

### H2. Detecção por caps excessivo + exclamações
- **Passos:**
  1. `detectCrisis('NÃO RECEBI NADA!!!')`
- **Resultado esperado:** `{ isCrisis: true }` baseado em heurística de uppercase e pontuação

### H3. Bloqueio de resposta automática em crise
- **Passos:**
  1. `processAutoReply()` com mensagem de crise
  2. Verificar retorno
- **Resultado esperado:** Função retorna sem enviar resposta; handover manual acionado

### H4. Chain-of-thought registrado em crise
- **Passos:**
  1. Enviar mensagem de crise
  2. Verificar `anne_logs_v2`
- **Resultado esperado:** Log com `chainOfThought` incluindo `"🚨 Crise: ..."`

---

## I. Tool Calling (OpenAI vs Anthropic/Google)

### I1. Tool calling nativo (OpenAI/Groq)
- **Pré-condição:** `openai_provider='openai'`, API key válida
- **Passos:**
  1. POST `/api/anne/chat` com mensagem que requer tool (ex: "quantos clientes acima de R$1000?")
  2. Verificar loop com `tool_calls`
- **Resultado esperado:** Modelo emite `finish_reason='tool_calls'`, tools executadas, resposta final em texto

### I2. Tool calling baseado em texto (Anthropic/Google)
- **Pré-condição:** `openai_provider='anthropic'`
- **Passos:**
  1. POST com mesma mensagem
  2. Verificar injeção de `TOOL_CALL_ADDENDUM` no system prompt
  3. Verificar parsing de `<tool_call>` na resposta
- **Resultado esperado:** Tools executadas via regex, loop continua, resposta final coerente

### I3. Proteção: bloqueio de busca + disparo simultâneo
- **Cenário:** Modelo tenta chamar `buscar_clientes` e `disparar_campanha` no mesmo ciclo
- **Resultado esperado:** Ambas bloqueadas com mensagem de protocolo: buscar → apresentar → aguardar → disparar

### I4. Limite de 5 iterações
- **Passos:**
  1. Forçar cenário onde model fica em loop de tools
- **Resultado esperado:** Loop encerrado após 5 iterações, resposta parcial retornada

---

## J. Cron de Mensagens Pendentes

### J1. Mensagem pendente marcada como failed
- **Passos:**
  1. Inserir mensagem com `status='pending'`, `created_at` há 6 minutos
  2. Chamar `GET /api/cron/pending-messages-timeout`
- **Resultado esperado:** Mensagem atualizada para `status='failed'`

### J2. Processamento em lote
- **Pré-condição:** 10+ mensagens com `status='pending'` > 5 min
- **Passos:**
  1. Executar cron
- **Resultado esperado:** Todas as mensagens elegíveis processadas em um único ciclo (até 500)

### J3. Mensagens recentes não afetadas
- **Pré-condição:** Mensagem com `status='pending'` criada há 2 minutos
- **Passos:**
  1. Executar cron
- **Resultado esperado:** Mensagem não alterada (< 5 min de pendência)

---

## Casos de Teste Integrados (Fluxo Completo)

### Cenário 1: Lead Quente → Auto → Rastreio → Kanban
1. Cliente novo: "Oi, quero comprar" → Onboarding
2. Cliente pergunta "Qual o preço?" → Anne classifica como Hot
3. Pedido confirmado; cliente envia código de rastreio
4. Logística vincula código, Kanban move para `DESPACHADO`
5. Tag `lead_quente` aplicada

### Cenário 2: Crise → Handover Manual → Log Completo
1. Cliente: "Produto com defeito!"
2. Anne detecta crise, suspende automação
3. Operadora assume conversa
4. Verificar `chain_of_thought` no log com `"🚨 Crise"`

### Cenário 3: Modo Suggest → UI Card → Edição → Envio
1. Tenant em modo `suggest`
2. Anne gera resposta → inserida em `anne_suggestions`
3. Frontend recebe via Realtime
4. Operadora clica **Editar**, modifica e envia manualmente
5. Status no banco atualizado para `sent`

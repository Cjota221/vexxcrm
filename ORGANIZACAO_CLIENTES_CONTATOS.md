# 📋 Organização de Clientes e Contatos — VEXX CRM 2.0

> Documento de referência interno. Última atualização: reflete o estado após commits `e9a895c`, `743addf` e `f1485f8`.

---

## 1. O que é um "Cliente" no VEXX CRM?

No sistema, **cliente** e **contato** são a mesma entidade — a tabela `clients` no Supabase.  
Um registro é criado automaticamente quando:
- Um número envia mensagem via WhatsApp (origem `whatsapp` / `facilzap`)
- Você importa uma planilha/CSV (origem `import`)
- Você cadastra manualmente (origem `manual`)
- Um contato entra via campanha (origem `campaign`)

> ⚠️ **Problema real da base:** muitos contatos chegam via WhatsApp **sem nome** — só com número de telefone. O sistema trata isso como dado válido, mas incompleto. Esses contatos aparecem como *"Sem nome"* com avatar "?" na tela de clientes.

---

## 2. Modelo de Dados (tabela `clients`)

### Campos de Identificação

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id` | UUID | ✅ | Identificador único |
| `tenant_id` | UUID | ✅ | Empresa dona do contato (multi-tenant) |
| `phone` | TEXT | ✅ | Telefone canônico: `5511999998888` |
| `phone_normalized` | TEXT | ✅ | Versão normalizada para busca rápida |
| `name` | TEXT | ❌ | Nome do contato (pode estar vazio) |
| `push_name` | TEXT | ❌ | Nome salvo no WhatsApp (vindo do app) |
| `name_manual` | TEXT | ❌ | Nome digitado manualmente no CRM |
| `email` | TEXT | ❌ | E-mail |
| `avatar_url` | TEXT | ❌ | Foto de perfil |

### Campos de CRM

| Campo | Tipo | Padrão | Descrição |
|---|---|---|---|
| `status` | TEXT | `active` | Estado do cliente (ver seção 3) |
| `source` | TEXT | `whatsapp` | Origem do contato (ver seção 4) |
| `tags` | TEXT[] | `[]` | Array de tags livres |
| `notes` | TEXT | — | Anotações internas |
| `custom_fields` | JSONB | `{}` | Campos extras personalizados |

### Métricas Financeiras

| Campo | Tipo | Descrição |
|---|---|---|
| `ltv` | DECIMAL(12,2) | Lifetime Value — total gasto historicamente |
| `total_orders` | INTEGER | Quantidade de pedidos realizados |
| `avg_ticket` | DECIMAL(12,2) | Ticket médio |
| `last_order_at` | TIMESTAMPTZ | Data do último pedido |

### Endereço

| Campo | Descrição |
|---|---|
| `address_street` | Rua |
| `address_number` | Número |
| `address_complement` | Complemento |
| `address_neighborhood` | Bairro |
| `address_city` | Cidade |
| `address_state` | Estado (UF) — usado para filtro regional |
| `address_zip` | CEP |

### Campos de Inteligência Artificial (migration 005)

Adicionados automaticamente pelo motor de IA quando há dados suficientes:

| Campo | Descrição |
|---|---|
| `rfm_recency` | Score de Recência (1-5) |
| `rfm_frequency` | Score de Frequência (1-5) |
| `rfm_monetary` | Score de Valor Monetário (1-5) |
| `rfm_score` | Código combinado (ex: `"555"`) |
| `rfm_segment` | Segmento calculado (ex: `"Champions"`, `"At Risk"`) |
| `churn_probability` | Probabilidade de churn (0–1) |
| `purchase_prob_30d` | Probabilidade de compra em 30 dias |
| `next_purchase_at` | Previsão da próxima compra |
| `ltv_projected_12m` | LTV projetado para 12 meses |
| `preferred_weekday` | Dia da semana que mais compra |
| `preferred_hour` | Hora do dia preferida |
| `response_rate` | Taxa de resposta às mensagens |
| `flag_needs_attention` | 🚨 Precisa de atenção manual |
| `flag_churn_risk` | ⚠️ Em risco de churn |
| `flag_auto_vip` | ⭐ VIP detectado automaticamente |
| `flag_upsell_ready` | 🎯 Pronto para upsell |
| `sentiment_general` | Sentimento geral detectado |
| `nps_estimated` | NPS estimado |

---

## 3. Status dos Clientes

O status define o **estado operacional** do contato no CRM:

| Status | Exibição | Significado |
|---|---|---|
| `novo` | 🔵 Novo | Recém-cadastrado, ainda sem histórico |
| `ativo` / `active` | 🟢 Ativo | Compra regularmente, engajado |
| `vip` | 🟡 VIP | Alto valor, cliente especial |
| `risco` | 🟠 Em risco | Sinal de churn — inativo há algum tempo |
| `inativo` / `inactive` | ⚫ Inativo | Sem compras por período longo |
| `blocked` | 🔴 Bloqueado | Bloqueou o número ou solicitou opt-out |

> 💡 O sistema aceita tanto `ativo` quanto `active` (e `inativo`/`inactive`) por compatibilidade com dados importados. Internamente, normaliza.

---

## 4. Origens dos Contatos (source)

De onde cada contato entrou na base:

| Source | Ícone | Como chega |
|---|---|---|
| `whatsapp` | 💬 | Entrou via conversa no WhatsApp (Evolution API) |
| `facilzap` | ⚡ | Sincronizado via integração FacilZap |
| `import` | 📂 | Importado via CSV/planilha na tela de importação |
| `manual` | ✍️ | Cadastrado manualmente por um agente no CRM |
| `campaign` | 📣 | Captado a partir de uma campanha de disparo |

> 💡 A maioria da base de e-commerces conectados ao WhatsApp terá origem `facilzap` ou `whatsapp`. Contatos sem nome costumam vir dessas origens.

---

## 5. Qualidade dos Dados da Base

### Problema: contatos sem nome

Um desafio comum em bases vindas do WhatsApp: o contato não salvou o número na agenda, então só temos o telefone.

| Tipo de contato | Situação | Como identificar na tela |
|---|---|---|
| **Com nome** | Nome + telefone preenchidos | Avatar colorido com iniciais |
| **Sem nome** | Só telefone, `name` é `null` ou `""` | Avatar cinza com "?" + texto itálico *"Sem nome"* |

### Como filtrar por qualidade de nome

Na página `/clientes`, use o filtro **"Nome"**:
- `Todos` — exibe todos
- `Com nome` — apenas contatos identificados
- `Sem nome` — apenas números anônimos

---

## 6. Filtros Disponíveis na Página `/clientes`

### Filtros de segmentação

| Filtro | Opções | O que faz |
|---|---|---|
| **Busca** | texto livre | Procura em nome, telefone e e-mail (debounce 300ms) |
| **Status** | novo, ativo, vip, risco, inativo, bloqueado | Filtra por estado do cliente |
| **Pedidos** | Todos / Com pedidos / Sem pedidos | `total_orders > 0` ou `= 0` |
| **Nome** | Todos / Com nome / Sem nome | `name IS NOT NULL AND name != ''` |
| **Origem** | WhatsApp / FacilZap / Importação / Manual / Campanha | Campo `source` |
| **Estado** | Todos os 27 estados brasileiros | Campo `address_state` |

### Paginação

| Opção | Descrição |
|---|---|
| **50 / 100 / 200 por página** | Selector de itens por página (padrão: **200**) |
| **Navegação numérica** | Botões de página + input "Ir para página X" |
| **Ordenação padrão** | `created_at DESC` — mais recentes primeiro |

---

## 7. Seleção em Lote

Para trabalhar com múltiplos contatos de uma vez:

### Como selecionar

1. **Checkbox individual** — clique na caixa de cada linha para selecionar contatos específicos
2. **"Selecionar página"** — botão que marca todos os contatos da página atual de uma vez
3. Para limpar, clique **✕** na barra flutuante

### Barra flutuante (aparece quando há selecionados)

Quando pelo menos 1 contato está selecionado, aparece uma barra fixa no rodapé da tela com:

```
📌 X selecionados  (Y com nome · Z sem nome)   [📣 Campanha]  [⬇ Exportar]  [✕]
```

| Ação | O que faz |
|---|---|
| **Campanha (📣)** | Redireciona para `/campanhas/nova` com os IDs pré-selecionados |
| **Exportar (⬇)** | Gera CSV com nome e telefone dos selecionados |
| **✕** | Limpa a seleção |

> 💡 A contagem com/sem nome na barra ajuda a saber a qualidade do público antes de disparar.

---

## 8. Fluxos de Disparo

Existem dois caminhos para enviar mensagens em massa:

### 8.1 Disparo Rápido (`/disparo-rapido`) ⚡

**Para quando:** você quer disparar agora, sem configurações complexas.

**Fluxo:**
1. Escolha o público com um clique (atalho)
2. Refine com filtro de estado (UF) se quiser
3. Veja a contagem em tempo real
4. Escreva a mensagem (ou use um template)
5. Clique em **Disparar**

**Atalhos de público disponíveis:**

| Atalho | Filtro aplicado |
|---|---|
| 🌐 Toda a base | Sem filtro |
| 👤 Com nome | `has_name: true` |
| 🛒 Com pedidos | `has_orders: true` |
| 🔔 Sem pedidos | `has_orders: false` |
| ❓ Sem nome + sem pedido | `has_name: false, has_orders: false` |

### 8.2 Campanhas completas (`/campanhas/nova`) 🗂️

**Para quando:** você quer configurar horário, sequência de mensagens, blocos de mídia, rastreamento detalhado.

**Recursos extras:**
- Agendamento futuro
- Múltiplos blocos (texto + imagem + delay)
- Condições e ramificações
- Métricas de entrega por campanha

---

## 9. Regras Anti-Ban

Todas as campanhas e disparos rápidos respeitam os seguintes limites **hardcoded** para proteger o número WhatsApp:

| Regra | Valor |
|---|---|
| Delay mínimo entre mensagens | **15 segundos** |
| Delay máximo entre mensagens | **45 segundos** |
| Pausa a cada X envios | **A cada 10 mensagens** |
| Duração da pausa | **60 segundos** |
| Recomendação de volume diário | **Máximo 200 disparos/dia** |

> ⚠️ Ultrapassar esses limites aumenta drasticamente o risco de banimento do número pelo WhatsApp.

---

## 10. Segurança e Multi-Tenant

- **Toda query** ao Supabase inclui `.eq('tenant_id', tenantId)` — garantindo que cada empresa só vê seus próprios contatos
- A tabela tem `UNIQUE(tenant_id, phone_normalized)` — o mesmo número não pode aparecer duplicado no mesmo tenant
- RLS (Row Level Security) ativo na tabela `clients`
- Rate limit na API: **60 requisições/minuto por tenant**
- Telefones são sempre normalizados via `PhoneNormalizer.canonical()` antes de qualquer busca

---

## 11. Índices do Banco de Dados

Índices criados para garantir performance nas operações mais frequentes:

| Índice | Coluna(s) | Uso |
|---|---|---|
| `idx_clients_tenant` | `tenant_id` | Toda listagem |
| `idx_clients_phone` | `tenant_id, phone_normalized` | Busca por telefone |
| `idx_clients_status` | `tenant_id, status` | Filtro por status |
| `idx_clients_name_trgm` | `name` (GIN trigram) | Busca textual por nome |
| `idx_clients_last_message` | `tenant_id, last_message_at DESC` | Ordenação no chat |
| `idx_clients_rfm_score` | `rfm_score` | Filtro RFM na inteligência |
| `idx_clients_rfm_segment` | `rfm_segment` | Segmentação RFM |
| `idx_clients_churn_prob` | `churn_probability` | Alertas de churn |
| `idx_clients_needs_attention` | `flag_needs_attention` (parcial) | Dashboard de atenção |

---

## 12. Arquivos do Sistema Relacionados

| Arquivo | Responsabilidade |
|---|---|
| `src/types/index.ts` | Interface `Client`, `ClientFilters`, `ClientStatus` |
| `src/hooks/useClients.ts` | Hook React Query — busca clientes com filtros |
| `src/app/api/clients/route.ts` | Endpoint `GET /api/clients` com todos os filtros |
| `src/app/(dashboard)/clientes/page.tsx` | Tela de listagem com seleção em lote |
| `src/app/(dashboard)/disparo-rapido/page.tsx` | Tela de disparo rápido |
| `src/lib/phone-normalizer.ts` | Normalização de telefones |
| `supabase/migrations/001_initial_schema.sql` | Schema base da tabela `clients` |
| `supabase/migrations/005_behavioral_intelligence.sql` | Colunas de IA/RFM |
| `supabase/migrations/011_client_identity.sql` | Colunas `push_name` e `name_manual` |

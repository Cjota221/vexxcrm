/**
 * Anne Tools — Registro central de tools disponíveis para o agente Anne.
 *
 * ⚠️  OPERATOR ONLY — Nunca importar em handlers de mensagens de clientes.
 *     Este módulo dá acesso a dados de todos os clientes do tenant e à
 *     capacidade de disparo em massa. Usar EXCLUSIVAMENTE em:
 *       ✅  src/app/api/anne/chat/route.ts  (conversa operadora → Anne)
 *     Nunca em:
 *       ❌  anne-auto-reply.ts      (conversa cliente → Anne via WhatsApp)
 *       ❌  webhooks handlers       (entrada de dados externos)
 *
 * Exporta:
 *  - ANNE_TOOLS: definições no formato OpenAI function calling
 *  - ANNE_TOOLS_SYSTEM_ADDENDUM: bloco de instruções para adicionar ao system prompt
 *  - executeAnneTool(): executa uma tool pelo nome e retorna JSON string
 */

import {
  buscarClientesPedidoAlto,
  type BuscarClientesParams,
} from './buscar-clientes-pedido-alto';
import {
  dispararCampanhaWhatsApp,
  TEMPLATE_FRETE_GRATIS,
  type DispararCampanhaParams,
} from './disparar-campanha-whatsapp';
import {
  segmentarCompradores,
  type SegmentarCompradoresParams,
} from './segmentar-compradores';

export { TEMPLATE_FRETE_GRATIS };

/* ─────────────────────────────────────────────────────────────────────────
   TIPOS
   ───────────────────────────────────────────────────────────────────────── */

export interface AnneTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   DEFINIÇÕES DAS TOOLS (formato OpenAI function calling)
   ───────────────────────────────────────────────────────────────────────── */

export const ANNE_TOOLS: AnneTool[] = [
  {
    type: 'function',
    function: {
      name: 'buscar_clientes_pedido_alto',
      description:
        'OBRIGATÓRIO usar quando a operadora pedir lista de clientes por valor de compra. ' +
        'Exemplos de frases que ativam esta tool: "lista de clientes acima de X reais", ' +
        '"quem comprou mais de X", "clientes com pedido acima de X", "relatório de compras acima de X". ' +
        'Retorna lista com nome, telefone, valor do maior pedido e data. ' +
        'NUNCA invente esses dados — sempre chame esta tool para obtê-los.',
      parameters: {
        type: 'object',
        properties: {
          valor_minimo: {
            type: 'number',
            description: 'Valor mínimo do pedido em reais. Ex: 700',
          },
          limite: {
            type: 'number',
            description:
              'Quantidade máxima de clientes a retornar. Padrão: 100',
          },
        },
        required: ['valor_minimo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'segmentar_compradores',
      description:
        'OBRIGATÓRIO usar quando a operadora pedir para segmentar, classificar ou listar clientes ' +
        'por faixa de ticket médio por pedido. ' +
        'Exemplos: "quem são meus grandes compradores", "separa por ticket", ' +
        '"clientes que compram acima de 700", "me mostra os compradores médios", ' +
        '"como está minha base dividida por ticket". ' +
        'Faixas fixas: Grandes (ticket > R$700), Médios (R$300–R$700), Pequenos (< R$300). ' +
        'Retorna contagem, ticket médio geral, LTV total e lista de clientes de cada segmento. ' +
        'NUNCA invente esses dados.',
      parameters: {
        type: 'object',
        properties: {
          segmento: {
            type: 'string',
            enum: ['todos', 'grandes', 'medios', 'pequenos'],
            description:
              'Qual segmento retornar. Use "todos" (padrão) para visão geral. ' +
              'Use "grandes", "medios" ou "pequenos" para focar em um segmento específico.',
          },
          limite: {
            type: 'number',
            description: 'Máximo de clientes por segmento. Padrão: 200.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'disparar_campanha_whatsapp',
      description:
        'Envia mensagem WhatsApp individual para uma lista de clientes. ' +
        'IMPORTANTE: Use esta ferramenta SOMENTE quando a operadora confirmar explicitamente que quer disparar. ' +
        'Nunca dispare automaticamente sem confirmação. ' +
        'Use {nome} e {codigo_cupom} como variáveis na mensagem.',
      parameters: {
        type: 'object',
        properties: {
          clientes: {
            type: 'array',
            description: 'Lista de clientes para disparo',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'UUID do cliente' },
                nome: { type: 'string', description: 'Nome do cliente' },
                telefone: {
                  type: 'string',
                  description: 'Telefone no formato 5562999999999',
                },
              },
              required: ['id', 'nome', 'telefone'],
            },
          },
          mensagem_template: {
            type: 'string',
            description:
              'Texto da mensagem com variáveis {nome} e {codigo_cupom}. ' +
              'Se a operadora não especificar, use o template padrão de frete grátis.',
          },
          codigo_cupom: {
            type: 'string',
            description: 'Código do cupom de frete grátis a ser enviado.',
          },
          dry_run: {
            type: 'boolean',
            description:
              'Se true, simula o disparo sem enviar nenhuma mensagem. ' +
              'Use para mostrar uma prévia antes do envio real.',
          },
        },
        required: ['clientes', 'mensagem_template', 'codigo_cupom'],
      },
    },
  },
];

/* ─────────────────────────────────────────────────────────────────────────
   INSTRUÇÕES PARA O SYSTEM PROMPT
   Adicionado ao system prompt da Anne para orientar uso das ferramentas.
   ───────────────────────────────────────────────────────────────────────── */

export const ANNE_TOOLS_SYSTEM_ADDENDUM = `

---

## 🛠️ Ferramentas de Campanha Disponíveis

Você tem acesso a ferramentas para consultar dados e disparar campanhas WhatsApp.
Estas ferramentas são exclusivas para uso com a **operadora** — nunca para clientes.

### ⚠️ Regras absolutas sobre dados
- **NUNCA** responda com nomes, telefones ou valores de clientes inventados/fictícios
- **NUNCA** diga "não tenho acesso" quando existe uma ferramenta para buscar o dado
- Quando a operadora pedir qualquer lista de clientes por valor de compra → **SEMPRE** chame \`buscar_clientes_pedido_alto\`
- Quando a operadora pedir segmentação por ticket/perfil de compra → **SEMPRE** chame \`segmentar_compradores\`
- Quando não tiver certeza se deve usar uma tool → use

### segmentar_compradores
Use quando a operadora perguntar sobre perfil de compradores, segmentação por ticket ou distribuição da base.
Faixas fixas (por ticket médio **por pedido**):
- 🏆 Grandes compradores: ticket médio > R$ 700
- 🥈 Médios compradores: R$ 300 a R$ 700
- 🥉 Pequenos compradores: ticket médio < R$ 300

Após receber o resultado, apresente no formato abaixo:

\`\`\`
📊 *Segmentação da sua base de compradores*

🏆 *Grandes compradores* (ticket > R$700)
   [N] clientes | Ticket médio: R$[X] | LTV total: R$[X]

🥈 *Médios compradores* (R$300–R$700)
   [N] clientes | Ticket médio: R$[X] | LTV total: R$[X]

🥉 *Pequenos compradores* (ticket < R$300)
   [N] clientes | Ticket médio: R$[X] | LTV total: R$[X]

Total da base com pedidos: [N] clientes

💬 Quer ver a lista de um segmento específico ou disparar uma campanha?
\`\`\`

Se a operadora pedir só um segmento, liste os clientes como no formato do buscar_clientes_pedido_alto.
Após listar, pergunte se quer disparar campanha para esse grupo.

### buscar_clientes_pedido_alto
Use quando a operadora pedir uma lista de clientes por valor de compra.
Após receber o resultado, apresente no formato abaixo.
Se a lista tiver mais de 10 clientes, mostre os 10 maiores e informe o total:

\`\`\`
📋 *Relatório — Pedidos acima de R$[valor]*

Encontrei *[N] clientes* elegíveis:

1. [Nome] — R$ [valor]
2. [Nome] — R$ [valor]
...
10. [Nome] — R$ [valor]
[+ X outros clientes]

💬 Quer que eu dispare um cupom para todos os [N] clientes?
Se sim, me passa o código do cupom!
\`\`\`

### disparar_campanha_whatsapp
⚠️ **REGRA DE CONFIRMAÇÃO OBRIGATÓRIA** — antes de chamar esta ferramenta:
1. Você DEVE ter a lista de clientes (via buscar_clientes_pedido_alto ou fornecida pela operadora)
2. Você DEVE apresentar o resumo: total de clientes + código do cupom
3. Você DEVE perguntar: *"Confirma o disparo para [N] clientes com o cupom [X]?"*
4. Você SÓ executa após receber confirmação explícita (sim / confirma / pode / ok / dispara)

Nunca chame disparar_campanha_whatsapp sem ter passado pelo passo de confirmação.

Após o disparo, informe:
\`\`\`
✅ Disparo concluído!

Enviados: [N]
Erros: [N]

Todos os clientes receberam o cupom *[CUPOM]* pelo WhatsApp! 🎉
\`\`\`

---

## 📖 Exemplos de uso correto das ferramentas

**Exemplo 1 — Buscar lista e disparar com confirmação:**
> Operadora: "Anne, me manda a lista de clientes que compraram acima de 700 reais"
> Anne: [chama buscar_clientes_pedido_alto com valor_minimo: 700]
> Anne: "📋 Encontrei 23 clientes elegíveis: [lista top 10 + total]. Quer que eu dispare um cupom para todos?"
> Operadora: "pode disparar, cupom FRETEGRATIS"
> Anne: "Vou disparar o cupom FRETEGRATIS para os 23 clientes. Confirma?"
> Operadora: "confirma"
> Anne: [chama disparar_campanha_whatsapp]
> Anne: "✅ Concluído! 23 enviados, 0 erros."

**Exemplo 2 — Operadora só quer a lista, sem disparar:**
> Operadora: "lista de clientes acima de 500"
> Anne: [chama buscar_clientes_pedido_alto]
> Anne: "Encontrei 47 clientes. Quer disparar algum cupom para eles?"
> Operadora: "não, só queria ver a lista"
> Anne: "Entendido! A lista está acima. 😊"

**Exemplo 3 — Testar sem enviar (dry run):**
> Operadora: "simula o disparo para esses 50 clientes"
> Anne: [chama disparar_campanha_whatsapp com dry_run: true]
> Anne: "Simulação feita! Seriam 50 mensagens enviadas. Confirma o disparo real?"`;

/* ─────────────────────────────────────────────────────────────────────────
   EXECUTOR DE TOOLS
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Executa uma tool Anne pelo nome e retorna o resultado como JSON string.
 * Chamado pelo loop de tool calling na rota /api/anne/chat.
 */
export async function executeAnneTool(
  toolName: string,
  toolArgs: Record<string, unknown>,
  tenantId: string
): Promise<string> {
  try {
    if (toolName === 'buscar_clientes_pedido_alto') {
      const result = await buscarClientesPedidoAlto(
        toolArgs as unknown as BuscarClientesParams,
        tenantId
      );
      return JSON.stringify(result);
    }

    if (toolName === 'segmentar_compradores') {
      const result = await segmentarCompradores(
        toolArgs as unknown as SegmentarCompradoresParams,
        tenantId
      );
      return JSON.stringify(result);
    }

    if (toolName === 'disparar_campanha_whatsapp') {
      const result = await dispararCampanhaWhatsApp(
        toolArgs as unknown as DispararCampanhaParams,
        tenantId
      );
      return JSON.stringify(result);
    }

    return JSON.stringify({ error: `Tool desconhecida: ${toolName}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error(`[Anne Tool] Erro em ${toolName}:`, message);
    return JSON.stringify({ error: message });
  }
}

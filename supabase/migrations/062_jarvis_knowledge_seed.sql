-- Seed: base de conhecimento do Jarvis para CJ Rasteirinhas
-- Execute no Supabase SQL Editor
-- tenant_id: 8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd

DO $$
DECLARE
  tid UUID := '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';
BEGIN

-- ─── NEGÓCIO ─────────────────────────────────────────────────────────────────
INSERT INTO jarvis_knowledge (tenant_id, titulo, conteudo, categoria, fonte, ativo) VALUES
(tid,
 'Visão geral da CJ Rasteirinhas',
 'A CJ Rasteirinhas é uma empresa de atacado de rasteirinhas femininas com fabricação própria em Goiânia-GO, Brasil. Fundada pela Carol, foca em revenda para empreendedoras e boutiques. Atende todo o Brasil. WhatsApp: 62981480687. Ad Account Meta: act_1244920119465862.',
 'negocio', 'manual', true),

(tid,
 'Modelo de negócio e canal de vendas',
 'Venda no atacado (mínimo de peças por pedido). Canal principal: WhatsApp (62981480687) e Instagram. Clientes são principalmente revendedoras, lojistas e empreendedoras de moda. Prazo de entrega: 5 a 10 dias úteis. Pagamento via PIX, boleto e cartão.',
 'negocio', 'manual', true),

(tid,
 'KPIs e metas de tráfego pago',
 'ROAS mínimo aceitável: 3x. CPL (custo por lead) máximo: R$15. CPC máximo: R$1,50. Orçamento diário sugerido por conjunto: R$30 a R$100. Meta de ROAS ideal: acima de 5x. Público frio: otimizar para leads/cliques. Público quente: otimizar para conversão/WhatsApp.',
 'negocio', 'manual', true),

-- ─── PRODUTO ─────────────────────────────────────────────────────────────────
(tid,
 'Catálogo de produtos: rasteirinhas',
 'Principal produto: rasteirinhas femininas artesanais. Materiais: couro sintético, camurça, verniz, glitter. Estilos: tirinhas, bico fino, tira no tornozelo, sandália rasteira. Tamanhos: 33 ao 40. Cores mais vendidas: nude, preto, dourado, branco, caramelo. Faixa de preço atacado: R$25 a R$65/par.',
 'produto', 'manual', true),

(tid,
 'Diferenciais do produto',
 'Fabricação própria (controle de qualidade). Lançamentos semanais de novos modelos. Customização para pedidos acima de 50 pares. Alta durabilidade comparada a concorrentes importados. Embalagem própria com identidade visual da CJ.',
 'produto', 'manual', true),

-- ─── PÚBLICO ─────────────────────────────────────────────────────────────────
(tid,
 'Público-alvo principal (frio)',
 'Mulheres 25-55 anos, Brasil. Interesses: moda feminina, empreendedorismo, revenda de moda, calçados. Comportamentos: compradores online, revendedores, donas de boutique. Segmentação geográfica: todo o Brasil, prioridade Sudeste e Centro-Oeste. Dispositivos: mobile-first.',
 'publico', 'manual', true),

(tid,
 'Público quente e remarketing',
 'Visitantes do site nos últimos 30 dias. Engajadores do Instagram (curtidas, comentários, saves) nos últimos 60 dias. Pessoas que enviaram mensagem no WhatsApp. Lookalike 1-3% de compradores. Melhor horário: 19h-22h e sábados 10h-14h.',
 'publico', 'manual', true),

(tid,
 'Público WhatsApp',
 'Foco em direcionar para o WhatsApp Business 62981480687. CTA ideal: "Ver coleção no WhatsApp" ou "Pedir catálogo". Melhor objetivo: Mensagens ou Leads. Funciona bem com vídeos de 15-30s mostrando os modelos. Conversão média: 1 em cada 8 cliques vira lead no WhatsApp.',
 'publico', 'manual', true),

-- ─── CAMPANHA ─────────────────────────────────────────────────────────────────
(tid,
 'Estrutura de campanha recomendada',
 'Sempre criar 3 conjuntos por campanha: 1) Público frio (interesse + lookalike), 2) Público quente (remarketing), 3) WhatsApp (mensagens diretas). Orçamento sugerido: 40% frio, 40% quente, 20% WhatsApp. Duração mínima para otimização: 7 dias antes de pausar.',
 'campanha', 'manual', true),

(tid,
 'Copies e CTAs que mais convertem',
 'Headlines que funcionam: "Nova coleção chegou — atacado a partir de R$XX/par", "Revendedoras de sucesso escolhem CJ", "Sapato que vende: rasteirinhas CJ". CTAs: "Ver catálogo", "Fazer pedido", "Quero revender". Evitar: preços sem contexto de atacado, fotos de produto sem modelo.',
 'campanha', 'manual', true),

(tid,
 'Formatos de criativo por desempenho',
 'Melhor formato: vídeo 9:16 (reels/stories) de 15-30s mostrando os modelos no pé. Segundo melhor: carrossel com 5+ modelos diferentes. Imagem estática funciona bem para remarketing. Sempre incluir legenda no vídeo (70% assiste sem áudio). Cores que convertem: fundo branco/nude com produto em destaque.',
 'campanha', 'manual', true),

-- ─── MERCADO ─────────────────────────────────────────────────────────────────
(tid,
 'Sazonalidade e períodos quentes',
 'Picos de venda: Dia das Mães (abril-maio), Festa Junina (junho), Black Friday (novembro), Natal (dezembro). Períodos mais fracos: janeiro-fevereiro. Recomendação: aumentar orçamento 50% nos 15 dias antes das datas comemorativas.',
 'mercado', 'manual', true),

(tid,
 'Tendências do mercado de rasteirinhas 2025',
 'Alta demanda por modelos coloridos (verde, lilás, rosa vibrante). Rasteirinhas com tira no tornozelo em alta. Materiais metalizados (dourado, prata) com procura crescente. Consumidora prefere comprar kit (3-5 pares) para revenda. Marketplace crescendo: Shopee e Mercado Livre para pequenas revendedoras.',
 'mercado', 'manual', true),

-- ─── APRENDIZADO ─────────────────────────────────────────────────────────────
(tid,
 'O que NÃO funciona em campanhas CJ',
 'Segmentação muito ampla sem interesses específicos de moda/revenda. Imagens de produto "deitado" sem modelo usando. Copy focada em preço sem mencionar atacado. Campanhas de conversão sem pixel configurado corretamente. Público masculino (excluir sempre).',
 'aprendizado', 'manual', true),

(tid,
 'Aprendizados de campanhas anteriores',
 'Vídeos com a Carol explicando o produto convertem 2x mais que vídeos só de produto. Testes A/B de headline: "Nova coleção" supera "Promoção" consistentemente. Lookalike de compradores do WhatsApp performa melhor que lookalike de visitantes do site. Público 35-50 anos converte melhor que 18-25 para atacado.',
 'aprendizado', 'manual', true);

RAISE NOTICE 'jarvis_knowledge seed inserido com sucesso para tenant %', tid;
END $$;

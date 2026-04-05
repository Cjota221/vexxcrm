export interface KnowledgeSeed {
  titulo: string;
  categoria: 'negocio' | 'produto' | 'publico' | 'campanha' | 'mercado' | 'concorrencia' | 'aprendizado';
  conteudo: string;
  fonte?: string;
}

export const CONHECIMENTO_INICIAL: KnowledgeSeed[] = [
  {
    titulo: 'Sobre a CJ Rasteirinhas',
    categoria: 'negocio',
    conteudo: `
      Empresa fabricante de rasteirinhas femininas sediada em Goiânia, Brasil.
      Fundadora: Caroline (Carol) de Carvalho Azevedo.
      Modelo de negócio: atacado para revendedoras (B2B).
      Rede de franquias digitais: C4 Franquias.
      CRM utilizado: VEXX CRM v2.0.
      Integração principal: FacilZap (ERP), Evolution API (WhatsApp).
      Meta Ads: conta act_1244920119465862, página 101337882545607.
      Pixel CJ: 518376893062766.
    `.trim(),
  },
  {
    titulo: 'Público-alvo das campanhas',
    categoria: 'publico',
    conteudo: `
      Perfil principal: mulheres 25-55 anos, Brasil.
      Interesses: empreendedorismo feminino, renda extra, moda, revenda de roupas.
      Dor principal: precisam de renda extra, querem trabalhar em casa.
      Motivação: independência financeira, ser a própria chefe.
      Ticket médio: a partir de R$25/par no atacado.
      Mínimo de compra: kit com pares sortidos.
      Canal de vendas: WhatsApp é o principal canal de fechamento.
    `.trim(),
  },
  {
    titulo: 'Tipos de campanha e objetivos',
    categoria: 'campanha',
    conteudo: `
      Frio: alcançar novas revendedoras que nunca ouviram falar da CJ.
      Quente: remarketing para quem já interagiu com a página ou site.
      WhatsApp: direcionar diretamente para conversa no WhatsApp.
      Catálogo: mostrar produtos automaticamente via catálogo Meta.
      ROAS mínimo aceitável: 3x.
      Orçamento diário típico: R$50-100/dia distribuído entre tipos.
      CTA mais eficiente: WHATSAPP_MESSAGE para fechamento rápido.
    `.trim(),
  },
  {
    titulo: 'Criativos de alta performance',
    categoria: 'campanha',
    conteudo: `
      Formato mais eficiente: vídeo vertical (Reels/Stories).
      Hook ideal: nos primeiros 3 segundos mostrar o produto ou a transformação.
      Tom: emocional, pessoal, linguagem simples de mulher para mulher.
      Evitar: tom muito corporativo, muito formal, foco só em preço.
      CTA no vídeo: mencionar WhatsApp explicitamente.
      Duração ideal: 15-30 segundos para frio, até 60s para quente.
    `.trim(),
  },
];

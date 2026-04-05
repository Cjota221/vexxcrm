/**
 * GET /api/meta/agente/stream
 * Server-Sent Events — envia atualizações em tempo real durante a execução do agente.
 * Auth: token Bearer passado como query param ?token=...
 *
 * Query params:
 *   token       — access token supabase (obrigatório)
 *   orcamento   — orçamento total em reais (default 50)
 *   tipos       — lista separada por vírgula: frio,quente,whatsapp
 *   nome        — prefixo do nome das campanhas
 */

import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { resolverTokenMeta } from '@/lib/services/meta-token.service';
import {
  distribuirOrcamento,
  criarCampanhaCompleta,
  criarCampanhaCatalogo,
  criarCampanhaMultiplosConjuntos,
  type TipoCampanha,
  type ConfiguracaoCriativo,
  type ConfigConjunto,
} from '@/lib/services/meta-adset-creator.service';

export const maxDuration = 60;

/* ─── Auth via token query param ─────────────────────────────────────────── */

async function getTenantId(token: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single();
  return data?.tenant_id ?? null;
}

/* ─── Handler ─────────────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token      = url.searchParams.get('token') ?? '';
  const orcamento  = Number(url.searchParams.get('orcamento') || '50');
  const tiposRaw   = url.searchParams.get('tipos') || 'frio,whatsapp';
  const tipos      = tiposRaw.split(',').filter(Boolean) as TipoCampanha[];
  const nome       = url.searchParams.get('nome') || `Agente ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
  const catalogoId = url.searchParams.get('catalogoId') ?? '';
  const conjuntosRaw = url.searchParams.get('conjuntos') ?? '';

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: object) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        // 1. Autenticar
        send('step', { id: 'auth', status: 'running', label: 'Verificando credenciais...' });
        const tenantId = await getTenantId(token);
        if (!tenantId) {
          send('step', { id: 'auth', status: 'error', label: 'Não autenticado' });
          send('done', { ok: false, erro: 'Token inválido ou expirado' });
          controller.close();
          return;
        }
        send('step', { id: 'auth', status: 'ok', label: 'Autenticado' });

        // 2. Verificar token Meta
        send('step', { id: 'meta', status: 'running', label: 'Verificando token Meta...' });
        let metaConfig: Awaited<ReturnType<typeof resolverTokenMeta>>;
        try {
          metaConfig = await resolverTokenMeta(tenantId);
        } catch {
          send('step', { id: 'meta', status: 'error', label: 'Token Meta não configurado' });
          send('done', { ok: false, erro: 'Configure o token Meta em Configurações' });
          controller.close();
          return;
        }
        send('step', { id: 'meta', status: 'ok', label: `Meta conectado — conta ${metaConfig.account_id ?? ''}` });

        // 3. Buscar page_id
        const supabase = createServerSupabaseClient();
        const { data: aiConfig } = await supabase
          .from('ai_provider_config')
          .select('meta_page_id')
          .eq('tenant_id', tenantId)
          .single();
        const pageId = aiConfig?.meta_page_id ?? '110009834520002';

        // 4. Buscar criativos
        send('step', { id: 'criativos', status: 'running', label: 'Analisando criativos disponíveis...' });
        const { data: criativos } = await supabase
          .from('ad_creatives')
          .select('id, nome, tipo, meta_video_id, meta_image_hash, url_preview, classificacao')
          .eq('tenant_id', tenantId)
          .eq('status', 'pronto')
          .or('meta_video_id.not.is.null,meta_image_hash.not.is.null')
          .order('created_at', { ascending: false })
          .limit(20);

        if (!criativos || criativos.length === 0) {
          send('step', { id: 'criativos', status: 'error', label: 'Nenhum criativo disponível' });
          send('done', { ok: false, erro: 'Faça upload de vídeos ou imagens primeiro' });
          controller.close();
          return;
        }
        send('step', {
          id: 'criativos',
          status: 'ok',
          label: `${criativos.length} criativo(s) encontrado(s)`,
          detalhe: criativos.slice(0, 3).map((c: { nome: string }) => c.nome).join(', '),
        });

        // ─── Modo avançado: múltiplos conjuntos em 1 campanha ─────────────
        if (conjuntosRaw) {
          let conjuntosParsed: Array<{
            tipo: TipoCampanha;
            orcamentoDiario: number;
            criativoIds: string[];
          }>;
          try {
            conjuntosParsed = JSON.parse(conjuntosRaw);
          } catch {
            send('done', { ok: false, erro: 'Erro ao parsear conjuntos' });
            controller.close();
            return;
          }

          // Montar ConfigConjunto[] com os criativos selecionados
          const conjuntosConfig: ConfigConjunto[] = conjuntosParsed.map(cj => {
            const criativosDoConjunto: ConfigConjunto['criativos'] = [];
            for (const id of cj.criativoIds) {
              const c = criativos!.find((cr: { id: string }) => cr.id === id);
              if (!c) continue;
              criativosDoConjunto.push({
                id: c.id,
                meta_video_id: c.meta_video_id ?? undefined,
                meta_image_hash: c.meta_image_hash ?? undefined,
                url_preview: c.url_preview ?? undefined,
                tipo: (c.tipo as 'video' | 'imagem') ?? (c.meta_video_id ? 'video' : 'imagem'),
              });
            }
            return {
              tipo: cj.tipo,
              orcamentoDiario: cj.orcamentoDiario,
              criativos: criativosDoConjunto,
            };
          });

          send('step', { id: 'multi', status: 'running', label: `Criando campanha com ${conjuntosConfig.length} conjunto(s)...` });

          try {
            const resultado = await criarCampanhaMultiplosConjuntos(tenantId, {
              nome,
              conjuntos: conjuntosConfig,
              paises: ['BR'],
              idadeMin: 18,
              idadeMax: 65,
              pageId,
              whatsappNumber: '5562993044255',
            });

            const TIPO_LABEL_MULTI: Record<string, string> = {
              frio: 'Público Frio', quente: 'Público Quente', whatsapp: 'WhatsApp',
            };

            // Salvar um draft por conjunto
            for (const cj of resultado.conjuntos) {
              const tipoLabel = TIPO_LABEL_MULTI[cj.tipo] ?? cj.tipo;
              const adIds = cj.ads.map(a => a.adId);

              await supabase.from('meta_campaign_drafts').insert({
                tenant_id: tenantId,
                nome: `${nome} — ${tipoLabel}`,
                objetivo: cj.tipo === 'frio' ? 'BRAND_AWARENESS' : 'LINK_CLICKS',
                status: 'aprovado',
                tipo: cj.tipo,
                orcamento_diario: conjuntosParsed.find(c => c.tipo === cj.tipo)?.orcamentoDiario ?? 5000,
                meta_campaign_id: resultado.campaignId,
                meta_adset_id: cj.adsetId,
                meta_ad_id: adIds[0] ?? null,
              });

              send('step', {
                id: `conjunto_${cj.tipo}`,
                status: 'ok',
                label: `${tipoLabel} — ${cj.ads.length} criativo(s) ✓`,
                detalhe: `Adset: ${cj.adsetId}`,
              });
            }

            // Jarvis memória
            supabase.from('jarvis_memoria').insert({
              tenant_id: tenantId,
              tipo: 'campanha_resultado',
              referencia_id: resultado.campaignId,
              titulo: nome,
              contexto: {
                modo: 'multiplos_conjuntos',
                nome_campanha: nome,
                campaign_id: resultado.campaignId,
                conjuntos: resultado.conjuntos.map(c => ({ tipo: c.tipo, adsetId: c.adsetId, totalAds: c.ads.length })),
                criado_em: new Date().toISOString(),
              },
              resultado: null,
              aprendizado: null,
            }).then(({ error: memErr }) => { if (memErr) console.warn('[Jarvis] Erro memória multi:', memErr.message); });

            send('step', { id: 'multi', status: 'ok', label: `Campanha criada com ${resultado.conjuntos.length} conjunto(s) ✓` });
            send('done', {
              ok: true,
              resumo: `1 campanha com ${resultado.conjuntos.length} conjunto(s) e ${resultado.conjuntos.reduce((a, c) => a + c.ads.length, 0)} criativo(s) — tudo pausado`,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            send('step', { id: 'multi', status: 'error', label: 'Erro ao criar campanha', detalhe: msg });
            send('done', { ok: false, erro: msg });
          }
        } else {

        // ─── Modo original: 1 campanha por tipo ──────────────────────────

        // 5. Distribuir orçamento
        send('step', { id: 'orcamento', status: 'running', label: 'Calculando distribuição de orçamento...' });
        const dist = distribuirOrcamento(orcamento, tipos);
        const orcPorTipo: Record<string, number> = {};
        dist.forEach(d => { orcPorTipo[d.tipo] = d.orcamentoCentavos; });
        send('step', {
          id: 'orcamento',
          status: 'ok',
          label: `R$${orcamento}/dia distribuídos`,
          detalhe: dist.map(d => `${d.label}: R$${(d.orcamentoCentavos / 100).toFixed(0)}/dia`).join(' | '),
        });

        // 6. Criar campanha por tipo
        const resultados: Array<{ tipo: TipoCampanha; ok: boolean; erro?: string; campaignId?: string }> = [];

        const TIPO_LABEL_MAP: Record<TipoCampanha, string> = {
          frio:     'Público Frio',
          quente:   'Público Quente',
          whatsapp: 'WhatsApp',
          catalogo: 'Catálogo',
        };

        const SCORE_KEY: Record<TipoCampanha, string> = {
          frio:     'adequacao_publico_frio',
          quente:   'adequacao_publico_quente',
          whatsapp: 'adequacao_whatsapp',
          catalogo: 'adequacao_publico_frio',
        };

        for (const tipo of tipos) {
          const tipoLabel = TIPO_LABEL_MAP[tipo];

          send('step', {
            id: `campanha_${tipo}`,
            status: 'running',
            label: `Criando campanha ${tipoLabel}...`,
          });

          try {
            let resultado: { campaignId: string; adsetId: string; adId: string };

            if (tipo === 'catalogo') {
              // Campanha de catálogo (DPA) — não usa criativo da galeria
              if (!catalogoId) throw new Error('Catálogo não selecionado');
              resultado = await criarCampanhaCatalogo(tenantId, {
                nome:            `${nome} — ${tipoLabel}`,
                catalogoId,
                orcamentoDiario: orcPorTipo[tipo] ?? 5000,
                pageId,
                paises:          ['BR'],
                idadeMin:        18,
                idadeMax:        65,
              });

              const { error: draftInsertError } = await supabase
                .from('meta_campaign_drafts')
                .insert({
                  tenant_id:             tenantId,
                  nome:                  `${nome} — ${tipoLabel}`,
                  objetivo:              'OUTCOME_SALES',
                  status:                'aprovado',
                  tipo,
                  orcamento_diario:      orcPorTipo[tipo] ?? 5000,
                  meta_campaign_id:      resultado.campaignId,
                  meta_adset_id:         resultado.adsetId,
                  meta_ad_id:            resultado.adId,
                });
              if (draftInsertError) {
                console.error('[AGENTE STREAM] Erro ao salvar draft catálogo:', JSON.stringify(draftInsertError));
              } else {
                // Jarvis: salvar memória do catálogo
                supabase.from('jarvis_memoria').insert({
                  tenant_id: tenantId,
                  tipo: 'campanha_resultado',
                  referencia_id: resultado.campaignId,
                  titulo: `${nome} — ${tipoLabel}`,
                  contexto: { tipo_campanha: tipo, nome_campanha: nome, orcamento_diario: orcPorTipo[tipo] ?? 5000, catalogo_id: catalogoId, campaign_id: resultado.campaignId, adset_id: resultado.adsetId, ad_id: resultado.adId, criado_em: new Date().toISOString() },
                  resultado: null, aprendizado: null,
                }).then(({ error: memErr }) => { if (memErr) console.warn('[Jarvis] Erro ao salvar memória catálogo:', memErr.message); });
              }

              send('step', {
                id: `campanha_${tipo}`,
                status: 'ok',
                label: `${tipoLabel} criada e pausada ✓`,
                detalhe: `Catálogo: ${catalogoId} · Campaign: ${resultado.campaignId}`,
              });
              resultados.push({ tipo, ok: true, campaignId: resultado.campaignId });
            } else {
              // Campanha frio / quente / whatsapp — usa criativo da galeria
              const scoreKey = SCORE_KEY[tipo];
              const sorted = [...criativos].sort((a, b) => {
                const ca = (a.classificacao as Record<string, number> | null) ?? {};
                const cb = (b.classificacao as Record<string, number> | null) ?? {};
                return (cb[scoreKey] ?? 5) - (ca[scoreKey] ?? 5);
              });
              const criativo = sorted[0] as {
                id: string;
                nome: string;
                tipo: string;
                meta_video_id: string | null;
                meta_image_hash: string | null;
                url_preview: string | null;
              };

              const cfgCriativo: ConfiguracaoCriativo = {
                tipo:           (criativo.tipo as 'video' | 'imagem') ?? (criativo.meta_video_id ? 'video' : 'imagem'),
                metaVideoId:    criativo.meta_video_id ?? undefined,
                metaImageHash:  criativo.meta_image_hash ?? undefined,
                imageUrl:       criativo.url_preview ?? undefined,
                headline:       `${nome} — ${tipoLabel}`,
                texto:          '',
                cta:            tipo === 'whatsapp' || tipo === 'quente' ? 'WHATSAPP_MESSAGE' : 'LEARN_MORE',
                pageId,
                whatsappNumber: tipo === 'whatsapp' || tipo === 'quente' ? '5562993044255' : undefined,
              };

              resultado = await criarCampanhaCompleta(tenantId, {
                nome:            `${nome} — ${tipoLabel}`,
                tipo,
                orcamentoDiario: orcPorTipo[tipo] ?? 5000,
                paises:          ['BR'],
                idadeMin:        18,
                idadeMax:        65,
                criativo:        cfgCriativo,
              });

              const { error: draftInsertError } = await supabase
                .from('meta_campaign_drafts')
                .insert({
                  tenant_id:             tenantId,
                  nome:                  `${nome} — ${tipoLabel}`,
                  objetivo:              tipo === 'frio' ? 'BRAND_AWARENESS' : 'LINK_CLICKS',
                  status:                'aprovado',
                  tipo,
                  criativo_id:           criativo.id,
                  copy_headline:         cfgCriativo.headline,
                  copy_texto:            cfgCriativo.texto || null,
                  copy_cta:              cfgCriativo.cta,
                  orcamento_diario:      orcPorTipo[tipo] ?? 5000,
                  meta_campaign_id:      resultado.campaignId,
                  meta_adset_id:         resultado.adsetId,
                  meta_ad_id:            resultado.adId,
                  criativo_url_preview:  criativo.url_preview ?? null,
                });
              if (draftInsertError) {
                console.error('[AGENTE STREAM] Erro ao salvar draft:', JSON.stringify(draftInsertError));
              } else {
                console.log('[AGENTE STREAM] Draft salvo com sucesso para tipo:', tipo);
                // Jarvis: salvar memória da campanha (fire-and-forget)
                supabase.from('jarvis_memoria').insert({
                  tenant_id: tenantId,
                  tipo: 'campanha_resultado',
                  referencia_id: resultado.campaignId,
                  titulo: `${nome} — ${tipoLabel}`,
                  contexto: { tipo_campanha: tipo, nome_campanha: nome, orcamento_diario: orcPorTipo[tipo] ?? 5000, criativo_id: criativo.id, criativo_nome: criativo.nome, campaign_id: resultado.campaignId, adset_id: resultado.adsetId, ad_id: resultado.adId, criado_em: new Date().toISOString() },
                  resultado: null, aprendizado: null,
                }).then(({ error: memErr }) => { if (memErr) console.warn('[Jarvis] Erro ao salvar memória:', memErr.message); });
              }

              send('step', {
                id: `campanha_${tipo}`,
                status: 'ok',
                label: `${tipoLabel} criada e pausada ✓`,
                detalhe: `Criativo: "${criativo.nome}" · Campaign: ${resultado.campaignId}`,
              });
              resultados.push({ tipo, ok: true, campaignId: resultado.campaignId });
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            send('step', {
              id: `campanha_${tipo}`,
              status: 'error',
              label: `Erro ao criar ${tipoLabel}`,
              detalhe: msg,
            });
            resultados.push({ tipo, ok: false, erro: msg });
          }
        }

        // 7. Conclusão
        const sucessos = resultados.filter(r => r.ok).length;
        send('done', {
          ok: sucessos > 0,
          resultados,
          resumo: sucessos === tipos.length
            ? `${sucessos} campanha(s) criada(s) — todas pausadas aguardando aprovação`
            : `${sucessos} de ${tipos.length} campanha(s) criada(s)`,
        });

        } // fim else modo original
      } catch (err) {
        send('done', { ok: false, erro: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

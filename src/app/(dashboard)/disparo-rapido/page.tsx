'use client';

/**
 * Disparo RÃ¡pido â€” versÃ£o simplificada.
 * 1. Mostra quantos contatos tem na base
 * 2. Escreve a mensagem
 * 3. Dispara
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Zap, Users, Send, Loader2, AlertCircle, CheckCircle2, ArrowRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { WhatsAppTextEditor } from '@/components/campaigns/WhatsAppTextEditor';

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ tipos */

interface ContatoPreview {
  id: string;
  phone: string;
  name?: string;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ componente */

export default function DisparoRapidoPage() {
  const router = useRouter();

  /* contagem da base */
  const [total, setTotal] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(true);

  /* mensagem */
  const [mensagem, setMensagem] = useState('');

  /* disparo */
  const [nomeCampanha, setNomeCampanha] = useState('');
  const [disparando, setDisparando] = useState(false);
  const [resultado, setResultado] = useState<{ campanha_id: string; total_jobs: number; eta_minutes: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  /* buscar total de contatos da base */
  const fetchTotal = useCallback(async () => {
    setLoadingCount(true);
    try {
      const res = await api.get<{ total: number }>('/api/clients/stats');
      if (!res.error) {
        const raw = res.data as any;
        setTotal(raw?.total ?? 0);
      }
    } finally {
      setLoadingCount(false);
    }
  }, []);

  useEffect(() => { fetchTotal(); }, [fetchTotal]);

  /* disparar */
  const handleDisparar = async () => {
    if (!mensagem.trim() || !total || total === 0) return;
    setDisparando(true);
    setErro(null);

    try {
      const res = await api.get<{ data: ContatoPreview[]; total: number }>('/api/clients', {
        per_page: '2000',
        page: '1',
      });
      if (res.error) throw new Error(res.error);
      const todos = (res.data as any).data as ContatoPreview[];

      const destinatarios = todos
        .filter(c => c.phone)
        .map(c => ({
          id: c.id,
          telefone: c.phone,
          nome: c.name || '',
          cidade: '',
          estado: '',
        }));

      if (destinatarios.length === 0) throw new Error('Nenhum contato com telefone encontrado');

      const nome = nomeCampanha.trim() ||
        `Disparo RÃ¡pido ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;

      const payload = {
        nome,
        blocos: [{
          id: crypto.randomUUID().slice(0, 8),
          ordem: 0,
          tipo: 'texto',
          conteudo: { texto_raw: mensagem.trim() },
        }],
        destinatarios,
        tipo_destinatario: 'contatos',
        config_antiban: {
          delay_min_ms: 15000,
          delay_max_ms: 45000,
          cooloff_a_cada: 10,
          cooloff_duracao_ms: 60000,
        },
      };

      const resp = await api.post<{ campanha_id: string; total_jobs: number; eta_minutes: number }>(
        '/api/v2/campanhas', payload
      );
      if (resp.error) throw new Error(resp.error);

      await api.post(`/api/v2/campanhas/${(resp.data as any).campanha_id}/iniciar`, {});
      setResultado(resp.data as any);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao disparar');
    } finally {
      setDisparando(false);
    }
  };

  /* â”€â”€ resultado final â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  if (resultado) {
    return (
      <div className="max-w-lg mx-auto mt-16">
        <Card>
          <div className="p-10 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <CheckCircle2 size={32} className="text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-txt-primary">Disparo iniciado! ðŸš€</h2>
            <p className="text-txt-secondary">
              <span className="font-bold text-txt-primary">{resultado.total_jobs}</span> mensagens enfileiradas.<br />
              Tempo estimado: <span className="font-bold text-txt-primary">~{resultado.eta_minutes} min</span>
            </p>
            <p className="text-xs text-txt-secondary bg-amber-50 border border-amber-100 rounded-xl px-4 py-2 inline-block">
              â± Anti-ban ativo: 15â€“45s entre envios, pausa a cada 10 mensagens
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => router.push(`/campanhas/${resultado.campanha_id}`)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-txt-secondary hover:bg-surface-50 transition-colors"
              >
                Ver progresso
              </button>
              <button
                onClick={() => { setResultado(null); setMensagem(''); setNomeCampanha(''); setErro(null); }}
                className="px-4 py-2 rounded-xl bg-crm-primary text-white text-sm font-semibold hover:bg-crm-primary/90 flex items-center gap-1.5 transition-colors"
              >
                <Zap size={14} /> Novo disparo
              </button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  /* â”€â”€ formulÃ¡rio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  return (
    <div className="space-y-5 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-crm-primary/10 flex items-center justify-center">
          <Zap size={20} className="text-crm-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Disparo RÃ¡pido</h1>
          <p className="text-sm text-txt-secondary">Escreva a mensagem e envie para toda a base de uma vez.</p>
        </div>
      </div>

      {/* Card: quem vai receber */}
      <Card>
        <div className="p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-crm-primary/10 flex items-center justify-center shrink-0">
            <Users size={22} className="text-crm-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-txt-secondary mb-0.5">DestinatÃ¡rios</p>
            {loadingCount ? (
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-crm-primary" />
                <span className="text-sm text-txt-secondary">Contando...</span>
              </div>
            ) : (
              <p className="text-2xl font-black text-txt-primary">
                {(total ?? 0).toLocaleString('pt-BR')}
                <span className="text-sm font-normal text-txt-secondary ml-2">contatos na base</span>
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-100 px-2.5 py-1 rounded-full font-medium">
              <CheckCircle2 size={11} /> Toda a base
            </span>
          </div>
        </div>
      </Card>

      {/* Card: mensagem */}
      <Card>
        <div className="p-5 space-y-3">
          <h2 className="font-semibold text-txt-primary text-sm">Mensagem</h2>
          <WhatsAppTextEditor
            value={mensagem}
            onChange={setMensagem}
            placeholder="Digite sua mensagem aqui... Use {{nome}} para personalizar."
            rows={5}
            variables={['{{nome}}', '{{produto}}', '{{cidade}}', '{{estado}}', '{{pedido}}']}
            showPreview={true}
          />
        </div>
      </Card>

      {/* Card: confirmar e disparar */}
      <Card>
        <div className="p-5 space-y-4">
          <h2 className="font-semibold text-txt-primary text-sm">Confirmar</h2>

          {/* Nome da campanha */}
          <div>
            <label className="text-xs text-txt-secondary block mb-1">Nome do disparo (opcional)</label>
            <input
              type="text"
              placeholder="Ex: PromoÃ§Ã£o fevereiro"
              value={nomeCampanha}
              onChange={e => setNomeCampanha(e.target.value)}
              className="w-full text-sm border border-surface-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crm-primary/20"
            />
          </div>

          {/* Aviso anti-ban */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <AlertCircle size={14} className="text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">
              <strong>Anti-ban ativo:</strong> 15â€“45s entre mensagens Â· pausa de 60s a cada 10 envios.
              Recomendado: mÃ¡x 200 contatos/dia.
            </p>
          </div>

          {erro && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle size={14} className="text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{erro}</p>
            </div>
          )}

          <button
            onClick={handleDisparar}
            disabled={disparando || !mensagem.trim() || !total || total === 0 || loadingCount}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-crm-primary text-white font-semibold text-sm hover:bg-crm-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {disparando
              ? <><Loader2 size={16} className="animate-spin" /> Criando disparo...</>
              : <><Send size={16} /> Disparar para {(total ?? 0).toLocaleString('pt-BR')} contatos <ArrowRight size={16} /></>
            }
          </button>
        </div>
      </Card>
    </div>
  );
}


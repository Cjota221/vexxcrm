'use client';

import React, { useRef, useState } from 'react';
import { FileText, Printer, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calcTotalPares, calcSubtotal, calcTotalPedido, NUMERACOES } from '@/hooks/use-pedidos';
import type { Pedido, PedidoItem } from '@/hooks/use-pedidos';

/* ─── Tipos ──────────────────────────────────────────────────────────────── */

interface PedidoActionsProps {
  pedido: Pedido & { itens: PedidoItem[] };
}

type ModoPDF = 'cliente' | 'producao';

/* ─── Helper: formata BRL ────────────────────────────────────────────────── */

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

/* ─── Template HTML do PDF ───────────────────────────────────────────────── */

/**
 * Retorna o HTML renderizado dentro da div oculta #pdf-render-area.
 * Para o modo "producao", preços são omitidos (foco nas numerações).
 */
function buildPdfHtml(
  pedido: Pedido & { itens: PedidoItem[] },
  modo: ModoPDF
): string {
  const itens = pedido.itens ?? [];
  const totalPares = itens.reduce((s, i) => s + calcTotalPares(i.grade), 0);
  const valorMercadoria = itens.reduce((s, i) => s + calcSubtotal(i.grade, i.valor_unitario), 0);
  const total = calcTotalPedido(itens, pedido.frete ?? 0, pedido.desconto ?? 0);

  const logoHtml = pedido.cliente_logo_url
    ? `<img src="${pedido.cliente_logo_url}" style="height:56px;object-fit:contain;border-radius:8px;" alt="Logo" />`
    : '';

  const enderecoHtml = [
    pedido.cliente_endereco,
    pedido.cliente_cidade && pedido.cliente_estado
      ? `${pedido.cliente_cidade} — ${pedido.cliente_estado}`
      : pedido.cliente_cidade || pedido.cliente_estado,
    pedido.cliente_cep ? `CEP ${pedido.cliente_cep}` : '',
  ].filter(Boolean).join('<br/>');

  const linhasItens = itens.map((item) => {
    const pares = calcTotalPares(item.grade);
    const subtotal = calcSubtotal(item.grade, item.valor_unitario);

    const colunasFoto = item.foto_url
      ? `<td style="padding:10px 12px;vertical-align:middle;"><img src="${item.foto_url}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;display:block;" /></td>`
      : `<td style="padding:10px 12px;vertical-align:middle;"><div style="width:60px;height:60px;background:#1c2333;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#4b5563;font-size:11px;">sem foto</div></td>`;

    const colunasNumeracoes = NUMERACOES.map(
      (n) => `<td style="padding:10px 8px;text-align:center;font-size:13px;color:#e2e8f0;font-weight:600;">${item.grade[n] || '—'}</td>`
    ).join('');

    const colunasPreco = modo === 'cliente'
      ? `<td style="padding:10px 12px;text-align:right;font-size:13px;color:#e2e8f0;">${brl(item.valor_unitario)}</td>
         <td style="padding:10px 12px;text-align:right;font-size:13px;font-weight:700;color:#60a5fa;">${brl(subtotal)}</td>`
      : '';

    return `
      <tr style="border-bottom:1px solid #1c2333;">
        ${colunasFoto}
        <td style="padding:10px 12px;vertical-align:middle;">
          <div style="font-size:13px;font-weight:600;color:#f1f5f9;">${item.cores || '—'}</div>
        </td>
        ${colunasNumeracoes}
        <td style="padding:10px 8px;text-align:center;font-size:13px;font-weight:700;color:#a3e635;">${pares}</td>
        ${colunasPreco}
      </tr>
    `;
  }).join('');

  const cabecalhosNumeracoes = NUMERACOES.map(
    (n) => `<th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:700;color:#94a3b8;background:#161b24;">${n}</th>`
  ).join('');

  const cabecalhosPreco = modo === 'cliente'
    ? `<th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#94a3b8;background:#161b24;">Unit.</th>
       <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#94a3b8;background:#161b24;">Subtotal</th>`
    : '';

  const rodapeFinanceiro = modo === 'cliente' ? `
    <table style="width:100%;margin-top:24px;border-collapse:collapse;">
      <tr>
        <td style="padding:8px 12px;font-size:12px;color:#94a3b8;">Valor mercadoria:</td>
        <td style="padding:8px 12px;text-align:right;font-size:13px;font-weight:600;color:#e2e8f0;">${brl(valorMercadoria)}</td>
      </tr>
      ${pedido.frete ? `<tr>
        <td style="padding:8px 12px;font-size:12px;color:#94a3b8;">Frete:</td>
        <td style="padding:8px 12px;text-align:right;font-size:13px;color:#e2e8f0;">+ ${brl(pedido.frete)}</td>
      </tr>` : ''}
      ${pedido.desconto ? `<tr>
        <td style="padding:8px 12px;font-size:12px;color:#94a3b8;">Desconto:</td>
        <td style="padding:8px 12px;text-align:right;font-size:13px;color:#f87171;">- ${brl(pedido.desconto)}</td>
      </tr>` : ''}
      <tr style="border-top:2px solid #1c2333;">
        <td style="padding:12px 12px;font-size:14px;font-weight:700;color:#f1f5f9;">TOTAL</td>
        <td style="padding:12px 12px;text-align:right;font-size:20px;font-weight:800;color:#60a5fa;">${brl(total)}</td>
      </tr>
    </table>
  ` : `
    <div style="margin-top:24px;padding:16px;background:#161b24;border-radius:12px;text-align:center;">
      <div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">Total de pares</div>
      <div style="font-size:28px;font-weight:800;color:#a3e635;">${totalPares}</div>
    </div>
  `;

  const titulo = modo === 'cliente' ? 'PEDIDO DE ATACADO' : 'ORDEM DE PRODUÇÃO';

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0d1117;color:#f1f5f9;min-width:900px;padding:32px;">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid #1c2333;">
        <div style="display:flex;align-items:center;gap:16px;">
          ${logoHtml}
          <div>
            <div style="font-size:11px;color:#94a3b8;letter-spacing:0.1em;font-weight:600;text-transform:uppercase;">${titulo}</div>
            <div style="font-size:20px;font-weight:800;color:#f1f5f9;margin-top:2px;">${pedido.cliente_nome || 'Cliente'}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;color:#94a3b8;">Data de emissão</div>
          <div style="font-size:13px;color:#e2e8f0;margin-top:2px;">${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:8px;">Prazo de entrega</div>
          <div style="font-size:13px;font-weight:600;color:#a3e635;margin-top:2px;">${pedido.prazo_entrega || '15 a 20 dias úteis'}</div>
        </div>
      </div>

      <!-- Dados do cliente -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
        <div style="background:#161b24;border-radius:12px;padding:16px;">
          <div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Dados do cliente</div>
          ${pedido.cliente_telefone ? `<div style="font-size:12px;color:#e2e8f0;margin-bottom:4px;">📱 ${pedido.cliente_telefone}</div>` : ''}
          ${pedido.cliente_cnpj ? `<div style="font-size:12px;color:#e2e8f0;margin-bottom:4px;">🏢 CNPJ: ${pedido.cliente_cnpj}</div>` : ''}
          ${enderecoHtml ? `<div style="font-size:12px;color:#94a3b8;margin-top:6px;line-height:1.6;">📍 ${enderecoHtml}</div>` : ''}
        </div>
        <div style="background:#161b24;border-radius:12px;padding:16px;">
          <div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Resumo</div>
          <div style="font-size:12px;color:#e2e8f0;margin-bottom:4px;">📦 ${itens.length} modelo${itens.length !== 1 ? 's' : ''}</div>
          <div style="font-size:12px;color:#e2e8f0;margin-bottom:4px;">👟 ${totalPares} pares no total</div>
          ${modo === 'cliente' ? `<div style="font-size:12px;color:#60a5fa;font-weight:700;margin-top:8px;">${brl(total)}</div>` : ''}
        </div>
      </div>

      <!-- Tabela de itens -->
      <table style="width:100%;border-collapse:collapse;background:#161b24;border-radius:12px;overflow:hidden;">
        <thead>
          <tr>
            <th style="padding:12px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;background:#161b24;"></th>
            <th style="padding:12px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;background:#161b24;">Cores/Ref</th>
            ${cabecalhosNumeracoes}
            <th style="padding:10px 8px;text-align:center;font-size:11px;font-weight:700;color:#94a3b8;background:#161b24;">Pares</th>
            ${cabecalhosPreco}
          </tr>
        </thead>
        <tbody>
          ${linhasItens}
        </tbody>
      </table>

      <!-- Rodapé financeiro -->
      ${rodapeFinanceiro}

      <!-- Assinatura -->
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #1c2333;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:10px;color:#4b5563;">Documento gerado pelo VEXX CRM · ${new Date().toLocaleString('pt-BR')}</div>
        <div style="font-size:10px;color:#4b5563;">CJ Rasteirinhas Atacado</div>
      </div>
    </div>
  `;
}

/* ─── Componente principal ───────────────────────────────────────────────── */

/**
 * Botão flutuante na parte inferior da tela de pedido.
 * Gera PDF via html2canvas + jsPDF:
 *   - "PDF Cliente": layout completo com preços e totais
 *   - "Ordem de Produção": layout sem preços, foco em numerações
 */
export function PedidoActions({ pedido }: PedidoActionsProps) {
  const renderAreaRef = useRef<HTMLDivElement>(null);
  const [gerando, setGerando] = useState<ModoPDF | null>(null);

  async function gerarPdf(modo: ModoPDF) {
    if (gerando) return;
    setGerando(modo);

    try {
      // Imports dinâmicos para evitar SSR
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);

      // Injeta o HTML na área de renderização oculta
      const area = renderAreaRef.current;
      if (!area) return;
      area.innerHTML = buildPdfHtml(pedido, modo);

      // Aguarda imagens carregarem
      const imgs = Array.from(area.querySelectorAll('img'));
      await Promise.allSettled(
        imgs.map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) { resolve(); return; }
              img.onload = () => resolve();
              img.onerror = () => resolve();
            })
        )
      );

      // Captura com html2canvas
      const canvas = await html2canvas(area, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0d1117',
        logging: false,
      });

      // Cria PDF A4 landscape para caber as colunas
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const ratio = canvas.width / canvas.height;
      const imgH = pdfW / ratio;

      // Se a imagem for maior que uma página, divide em múltiplas páginas
      let posY = 0;
      while (posY < imgH) {
        if (posY > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -posY, pdfW, imgH);
        posY += pdfH;
      }

      const nomeArquivo = `pedido-${(pedido.cliente_nome ?? 'cliente').replace(/\s+/g, '-').toLowerCase()}-${modo}.pdf`;
      pdf.save(nomeArquivo);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
    } finally {
      // Limpa a área de renderização
      if (renderAreaRef.current) renderAreaRef.current.innerHTML = '';
      setGerando(null);
    }
  }

  return (
    <>
      {/* Área de renderização oculta (fora do viewport) */}
      <div
        ref={renderAreaRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          width: '960px',
          zIndex: -1,
          pointerEvents: 'none',
        }}
      />

      {/* Barra flutuante inferior */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-2 bg-[#161b24] border border-[#2a3347] rounded-2xl px-3 py-2 shadow-2xl shadow-black/50">
          <span className="text-xs text-gray-500 font-medium pr-2 border-r border-[#1c2333]">
            Exportar PDF
          </span>

          {/* PDF para o cliente (com preços) */}
          <button
            onClick={() => gerarPdf('cliente')}
            disabled={!!gerando}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
              gerando === 'cliente'
                ? 'bg-blue-600/50 text-blue-300 cursor-wait'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            )}
          >
            {gerando === 'cliente'
              ? <Loader2 size={14} className="animate-spin" />
              : <FileText size={14} />}
            PDF Cliente
          </button>

          {/* Ordem de Produção (sem preços) */}
          <button
            onClick={() => gerarPdf('producao')}
            disabled={!!gerando}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
              gerando === 'producao'
                ? 'bg-purple-600/50 text-purple-300 cursor-wait'
                : 'bg-[#1c2333] hover:bg-[#2a3347] text-gray-300 hover:text-white border border-[#2a3347]'
            )}
          >
            {gerando === 'producao'
              ? <Loader2 size={14} className="animate-spin" />
              : <Printer size={14} />}
            Ordem de Produção
          </button>
        </div>
      </div>
    </>
  );
}

'use client';

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { PLPedido, PLItem, GRADE_TAMANHOS } from '@/hooks/use-private-label';

interface Props {
  pedido: PLPedido;
  itens:  PLItem[];
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtData = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

function buildPdfHtml(pedido: PLPedido, itens: PLItem[], modo: 'cliente' | 'producao'): string {
  const isCliente = modo === 'cliente';

  const linhasItens = itens.map(item => {
    const gradeCells = GRADE_TAMANHOS.map(t =>
      `<td style="border:1px solid #ddd;padding:6px 4px;text-align:center;font-size:12px;">${item.grade[t] || 0}</td>`,
    ).join('');
    return `
      <tr>
        <td style="border:1px solid #ddd;padding:6px 8px;font-size:12px;">${item.nome ?? '—'}</td>
        ${isCliente ? `<td style="border:1px solid #ddd;padding:6px 8px;font-size:12px;">${item.cores ?? '—'}</td>` : ''}
        ${gradeCells}
        <td style="border:1px solid #ddd;padding:6px 4px;text-align:center;font-size:12px;font-weight:600;">${item.total_pares}</td>
        ${isCliente ? `
        <td style="border:1px solid #ddd;padding:6px 8px;text-align:right;font-size:12px;">${fmtBRL(item.valor_unitario)}</td>
        <td style="border:1px solid #ddd;padding:6px 8px;text-align:right;font-size:12px;font-weight:600;">${fmtBRL(item.subtotal)}</td>
        ` : ''}
      </tr>
    `;
  }).join('');

  const headerCores = isCliente ? '<th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;">Cores</th>' : '';
  const headerFinanceiro = isCliente ? `
    <th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;">Preço Un.</th>
    <th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;">Subtotal</th>
  ` : '';

  const gradeTamanhoHeaders = GRADE_TAMANHOS.map(t =>
    `<th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;text-align:center;">${t}</th>`,
  ).join('');

  const logoHtml = pedido.cliente_logo_url
    ? `<img src="${pedido.cliente_logo_url}" style="max-height:60px;max-width:120px;object-fit:contain;" alt="Logo" />`
    : '';

  const enderecoHtml = pedido.cliente_cep
    ? `<p style="margin:2px 0;font-size:12px;color:#555;">${pedido.cliente_endereco ?? ''}, ${pedido.cliente_bairro ?? ''} — ${pedido.cliente_cidade ?? ''} / ${pedido.cliente_estado ?? ''} — CEP ${pedido.cliente_cep}</p>`
    : '';

  const totalHtml = isCliente ? `
    <div style="margin-top:24px;border-top:2px solid #7c3aed;padding-top:16px;">
      <table style="width:300px;margin-left:auto;border-collapse:collapse;">
        <tr>
          <td style="padding:4px 8px;font-size:13px;color:#555;">Subtotal itens</td>
          <td style="padding:4px 8px;font-size:13px;text-align:right;">${fmtBRL(itens.reduce((s, i) => s + i.subtotal, 0))}</td>
        </tr>
        <tr>
          <td style="padding:4px 8px;font-size:13px;color:#555;">Frete</td>
          <td style="padding:4px 8px;font-size:13px;text-align:right;">${fmtBRL(pedido.frete)}</td>
        </tr>
        <tr>
          <td style="padding:4px 8px;font-size:13px;color:#555;">Desconto</td>
          <td style="padding:4px 8px;font-size:13px;text-align:right;color:#dc2626;">- ${fmtBRL(pedido.desconto)}</td>
        </tr>
        <tr style="border-top:1px solid #ddd;">
          <td style="padding:8px;font-size:15px;font-weight:700;">TOTAL</td>
          <td style="padding:8px;font-size:15px;font-weight:700;text-align:right;color:#7c3aed;">${fmtBRL(pedido.total)}</td>
        </tr>
      </table>
    </div>
  ` : '';

  const observacoesHtml = pedido.observacoes
    ? `<div style="margin-top:20px;padding:12px;background:#f9f9f9;border-left:3px solid #7c3aed;border-radius:4px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#7c3aed;text-transform:uppercase;">Observações</p>
        <p style="margin:0;font-size:12px;color:#555;">${pedido.observacoes}</p>
       </div>`
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>${isCliente ? 'Pedido Private Label' : 'Ordem de Produção'} — ${pedido.cliente_nome ?? ''}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #222; margin: 0; padding: 32px; }
        table { border-collapse: collapse; width: 100%; }
      </style>
    </head>
    <body>
      <!-- Cabeçalho -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #7c3aed;">
        <div>
          <h1 style="margin:0 0 4px;font-size:20px;color:#7c3aed;">${isCliente ? 'Pedido Private Label' : 'Ordem de Produção'}</h1>
          <p style="margin:0;font-size:12px;color:#888;">Emitido em ${fmtData(new Date().toISOString())}</p>
          ${pedido.prazo_entrega ? `<p style="margin:4px 0 0;font-size:12px;color:#555;">Prazo de entrega: <strong>${pedido.prazo_entrega}</strong></p>` : ''}
        </div>
        ${logoHtml}
      </div>

      <!-- Dados do cliente -->
      <div style="margin-bottom:24px;padding:12px 16px;background:#f9f6ff;border-radius:8px;">
        <h2 style="margin:0 0 8px;font-size:14px;color:#7c3aed;text-transform:uppercase;letter-spacing:.05em;">Cliente</h2>
        <p style="margin:2px 0;font-size:13px;font-weight:600;">${pedido.cliente_nome ?? '—'}</p>
        ${pedido.cliente_cnpj ? `<p style="margin:2px 0;font-size:12px;color:#555;">CNPJ: ${pedido.cliente_cnpj}</p>` : ''}
        ${pedido.cliente_telefone ? `<p style="margin:2px 0;font-size:12px;color:#555;">Tel: ${pedido.cliente_telefone}</p>` : ''}
        ${pedido.cliente_email ? `<p style="margin:2px 0;font-size:12px;color:#555;">E-mail: ${pedido.cliente_email}</p>` : ''}
        ${enderecoHtml}
      </div>

      <!-- Tabela de itens -->
      <table>
        <thead>
          <tr>
            <th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;text-align:left;">Produto</th>
            ${headerCores}
            ${gradeTamanhoHeaders}
            <th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;text-align:center;">Total</th>
            ${headerFinanceiro}
          </tr>
        </thead>
        <tbody>${linhasItens}</tbody>
      </table>

      ${totalHtml}
      ${observacoesHtml}

      <!-- Rodapé -->
      <div style="margin-top:40px;text-align:center;font-size:10px;color:#aaa;border-top:1px solid #eee;padding-top:12px;">
        Documento gerado pelo VEXX CRM
      </div>
    </body>
    </html>
  `;
}

export function PdfPrivateLabel({ pedido, itens }: Props) {
  const [gerando, setGerando] = useState<'cliente' | 'producao' | null>(null);

  async function gerarPdf(modo: 'cliente' | 'producao') {
    setGerando(modo);
    try {
      const html = buildPdfHtml(pedido, itens, modo);

      /* Janela temporária para html2canvas */
      const win = window.open('', '_blank', 'width=900,height=700');
      if (!win) { alert('Permite pop-ups para gerar o PDF.'); return; }

      win.document.write(html);
      win.document.close();

      /* Aguarda imagens carregarem */
      await new Promise(r => setTimeout(r, 800));

      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);

      const canvas = await html2canvas(win.document.body, { scale: 2, useCORS: true });
      win.close();

      const imgData = canvas.toDataURL('image/png');
      const pdf     = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const w       = pdf.internal.pageSize.getWidth();
      const h       = (canvas.height * w) / canvas.width;

      let y = 0;
      const pageH = pdf.internal.pageSize.getHeight();
      while (y < h) {
        if (y > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -y, w, h);
        y += pageH;
      }

      const nome = pedido.cliente_nome?.replace(/\s+/g, '_') ?? 'pedido';
      pdf.save(`PL_${modo}_${nome}.pdf`);
    } catch (err) {
      console.error('[PDF]', err);
    } finally {
      setGerando(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {(['cliente', 'producao'] as const).map(modo => (
        <button
          key={modo}
          onClick={() => gerarPdf(modo)}
          disabled={!!gerando}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#161b24] border border-[#1c2333] text-xs text-[#6b7fa3] hover:text-white hover:border-purple-500/30 transition disabled:opacity-50"
        >
          {gerando === modo
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <FileDown className="w-3.5 h-3.5" />
          }
          PDF {modo === 'cliente' ? 'Cliente' : 'Produção'}
        </button>
      ))}
    </div>
  );
}

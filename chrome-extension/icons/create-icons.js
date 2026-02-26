/**
 * Gera os ícones PNG da extensão Chrome.
 * Execute: node chrome-extension/icons/create-icons.js
 * Requer: npm install canvas (ou use o script Python abaixo)
 */

// Alternativa sem dependências — gera ícones PNG via canvas nativo do Node
// Se não funcionar, use o icon.html para gerar manualmente

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];

sizes.forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Fundo azul royal
  ctx.fillStyle = '#1e3a5f';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.18);
  ctx.fill();

  // Letra V branca
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size * 0.6}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('V', size / 2, size / 2 + size * 0.03);

  const buffer = canvas.toBuffer('image/png');
  const outPath = path.join(__dirname, `icon${size}.png`);
  fs.writeFileSync(outPath, buffer);
  console.log(`✅ Gerado: icon${size}.png`);
});

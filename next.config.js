/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**.facilzap.app.br',
      },
    ],
  },
  serverExternalPackages: ['events'],

  // Evita preload de CSS chunks que não serão usados imediatamente,
  // eliminando os warnings "preloaded but not used within a few seconds".
  experimental: {
    optimizeCss: true,
  },

  // Cache longo para assets estáticos (hashed pelo Next.js)
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

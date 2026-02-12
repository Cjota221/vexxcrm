/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
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
};

module.exports = nextConfig;

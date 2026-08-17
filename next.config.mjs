/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/Servico-Entrega',
  assetPrefix: '/Servico-Entrega/',
  images: {
    unoptimized: true,
  },
  experimental: {
    serverComponentsExternalPackages: ["tesseract.js"],
  },
};

export default nextConfig;

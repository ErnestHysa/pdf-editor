/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@pagecraft/pdf-engine'],
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    // pdfjs-dist v3.11.174 legacy build — not in package.json exports
    config.resolve.alias['pdfjs-dist/legacy'] =
      require.resolve('pdfjs-dist/legacy/build/pdf.js');
    return config;
  },
};

module.exports = nextConfig;

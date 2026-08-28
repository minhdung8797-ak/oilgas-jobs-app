/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cần cho Docker: xuất bản standalone -> image nhỏ, không cần node_modules đầy đủ
  output: 'standalone',
  transpilePackages: ['@og/shared'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

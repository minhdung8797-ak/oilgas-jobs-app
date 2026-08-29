/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Docker cần 'standalone' (image nhỏ, không phải copy toàn bộ node_modules).
  // Nhưng Vercel KHÔNG hỗ trợ chế độ này: nó dời kết quả sang .next/standalone khiến
  // Vercel báo `No Output Directory named ".next" found`. Vercel tự đặt biến VERCEL=1,
  // dùng nó để phân biệt hai môi trường.
  output: process.env.VERCEL ? undefined : 'standalone',
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

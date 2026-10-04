import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@naite/saju', '@naite/letter'],
  poweredByHeader: false,
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // silence “Critical dependency” warnings
      config.module.exprContextCritical = false;
    }
    return config;
  },
};

export default nextConfig; // ← ESM export

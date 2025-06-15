// next.config.js
/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  webpack(config) {
    for (const rule of config.module.rules) {
      if (!rule.oneOf) continue;

      for (const oneOf of rule.oneOf) {
        const uses = Array.isArray(oneOf.use)
          ? oneOf.use
          : oneOf.use
          ? [oneOf.use]
          : [];

        for (const useEntry of uses) {
          if (
            useEntry &&
            typeof useEntry === "object" &&
            useEntry.loader?.includes("css-loader")
          ) {
            useEntry.options = {
              ...useEntry.options,
              esModule: true,
            };
          }
        }
      }
    }

    return config;
  },
};

export default nextConfig;

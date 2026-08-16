import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // El build de producción debe fallar si hay errores de tipos (regla del proyecto).
    ignoreBuildErrors: false,
  },
};

export default nextConfig;

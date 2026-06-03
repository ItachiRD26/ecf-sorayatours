import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      // DGII usa capitalizaciones inconsistentes en este endpoint según el paso
      // Paso 8 (recepción):   llama /validacioncertificado  (todo minúsculas)
      // Paso 10 (aprobación): llama /validacionCertificado  (C mayúscula)
      // Ambas apuntan a nuestro handler en minúsculas
      {
        source:      "/fe/autenticacion/api/validacionCertificado",
        destination: "/fe/autenticacion/api/validacioncertificado",
      },
      {
        source:      "/fe/autenticacion/api/ValidacionCertificado",
        destination: "/fe/autenticacion/api/validacioncertificado",
      },
    ];
  },
};

export default nextConfig;
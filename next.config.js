/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Só remotePatterns. O campo `images.domains` foi descontinuado no Next
    // 15 e passou a imprimir aviso a cada build e a cada subida do dev; ele
    // também era mais frouxo, porque liberava o host inteiro sem olhar
    // protocolo nem caminho. Os hosts que estavam lá viraram os padrões
    // abaixo, sem perder nenhum.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pps.whatsapp.net", // Foto de perfil do WhatsApp
      },
      // Heranças do funil de Instagram. Ficam porque as telas antigas ainda
      // podem receber essas URLs; o apex e o scontent.instagram.com estão
      // listados à parte porque "**." casa subdomínio, não o domínio puro.
      {
        protocol: "https",
        hostname: "**.cdninstagram.com",
      },
      {
        protocol: "https",
        hostname: "cdninstagram.com",
      },
      {
        protocol: "https",
        hostname: "**.fna.fbcdn.net",
      },
      {
        protocol: "https",
        hostname: "**.instagram.com",
      },
      {
        protocol: "https",
        hostname: "i.pravatar.cc", // Foto de demonstração
      },
    ],
  },
};

module.exports = nextConfig;

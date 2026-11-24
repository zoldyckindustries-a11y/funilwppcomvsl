import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Pixels } from "./components/Pixels";

// Sem `weight`, o next/font baixa a Inter VARIÁVEL: um arquivo que cobre de
// 100 a 900. Listando os seis pesos, ele baixava seis woff2 estáticos — seis
// requisições concorrendo com o HTML e com o JavaScript na primeira pintura,
// num celular em 4G lenta. O peso 300 e o 800 que a abertura usa continuam
// disponíveis; só param de custar um arquivo cada.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Detective White - Plataforma de Monitoramento",
  description:
    "A maior tecnologia internacional de monitoramento de WhatsApp acaba de liberar sua versão oficial em português.",
  // Verificação de domínio do Business Manager. Vai pela API de metadata do
  // Next em vez de uma <meta> escrita à mão no <head>: assim a tag entra no
  // HTML de todas as rotas, que é onde o verificador da Meta procura.
  verification: {
    other: {
      "facebook-domain-verification": "3fefk1jnd644es070jflw63sxvtcb7",
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Abre a conexão com os terceiros antes de alguém pedir qualquer
            coisa a eles. Os pixels sobem com `afterInteractive`, ou seja,
            depois da hidratação — e aí o celular ainda teria que pagar DNS,
            TCP e TLS com cada host, em série, justamente na janela em que a
            thread já está ocupada. Com o preconnect esse custo acontece em
            paralelo com o HTML.

            `scripts.converteai.net` entra porque é de lá que vem o player da
            VSL. Ele só é pedido quando a oferta monta, mas a conexão aberta
            adiantado tira o handshake do caminho crítico do vídeo — que é o
            elemento de que a venda inteira depende.

            `pps.whatsapp.net` leva só dns-prefetch: a foto do perfil pode
            nem existir para aquele número, então não vale segurar uma
            conexão aberta à toa — mas resolver o nome adiantado é de graça. */}
        <link rel="preconnect" href="https://connect.facebook.net" />
        <link rel="preconnect" href="https://cdn.utmify.com.br" />
        <link rel="preconnect" href="https://scripts.converteai.net" />
        <link rel="dns-prefetch" href="https://pps.whatsapp.net" />
      </head>
      <body
        className={`${inter.variable} font-inter antialiased`}
        suppressHydrationWarning
      >
        {children}
        {/* Um único ponto de carga para Meta e Utmify, valendo para todas as
            rotas do funil. */}
        <Pixels />
      </body>
    </html>
  );
}

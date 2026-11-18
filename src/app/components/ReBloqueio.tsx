"use client";

import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { colors } from "../../constants/theme";

/**
 * O re-bloqueio: a criptografia voltando por cima do que o lead acabou de ver.
 *
 * É a peça que fecha a prévia. Em vez de um modal com botão (mais uma
 * decisão, mais tempo para esfriar), a tela trava na frente dele e a oferta
 * abre sozinha logo depois. O impulso tem que chegar na oferta ainda quente.
 */
export default function ReBloqueio({
  titulo = "A criptografia voltou",
  subtitulo = "A janela de acesso fechou. O que estava aberto foi trancado de novo.",
  onAgora,
}: {
  titulo?: string;
  subtitulo?: string;
  onAgora?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center px-6"
      style={{
        backgroundColor: "rgba(4, 36, 31, 0.82)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
      onClick={onAgora}
    >
      <motion.div
        initial={{ scale: 0.86, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 26 }}
        className="text-center"
      >
        <motion.div
          initial={{ scale: 1.6, rotate: -12 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
          className="w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center"
          style={{
            backgroundColor: "rgba(245,158,11,0.16)",
            border: "1px solid rgba(245,158,11,0.45)",
          }}
        >
          <Lock className="w-9 h-9" style={{ color: "#F59E0B" }} strokeWidth={2.5} />
        </motion.div>

        <h2 className="text-white text-[22px] font-extrabold leading-tight mb-2">
          {titulo}
        </h2>
        <p className="text-white/70 text-[13.5px] leading-snug max-w-[300px] mx-auto">
          {subtitulo}
        </p>

        {/* Barrinha que corre sozinha: diz sem palavras que a próxima tela
            já está vindo, então ninguém fica esperando um botão. */}
        <div
          className="h-[3px] w-40 mx-auto mt-6 rounded-full overflow-hidden"
          style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
        >
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 1.6, ease: "linear" }}
            className="h-full"
            style={{ backgroundColor: colors.primaryBright }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

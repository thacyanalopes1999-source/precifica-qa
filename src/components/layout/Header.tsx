
"use client";

import { usePathname } from "next/navigation";
import { Menu, ShieldCheck } from "lucide-react";

const titulos: Record<string, string> = {
  dashboard: "Dashboard",
  importar: "Importar arquivos",
  comparacoes: "Comparações de produtos",
  revisao: "Revisão manual",
  exclusoes: "Candidatos à exclusão",
  historico: "Histórico de processamento",
  configuracoes: "Configurações",
};

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const secao = pathname.split("/")[1] || "dashboard";
  const titulo = titulos[secao] || "Precifica QA";

  return (
    <header className="sticky top-0 z-30 flex min-h-19 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Abrir menu"
          className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
        >
          <Menu size={24} />
        </button>

        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-400">
            Precifica QA / Workspace
          </p>
          <h2 className="truncate text-base font-bold text-slate-900 md:text-lg">
            {titulo}
          </h2>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 sm:flex">
          <ShieldCheck size={15} />
          Revisão obrigatória
        </div>

        <div
          aria-label="Perfil do usuário"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-sm font-bold text-blue-700"
        >
          QA
        </div>
      </div>
    </header>
  );
}

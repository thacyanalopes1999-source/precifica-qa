"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, ShieldCheck } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

const titulos: Record<string, string> = {
  dashboard: "Dashboard",
  importar: "Importar arquivos",
  "validar-urls": "Validar URLs",
  comparacoes: "Comparações de produtos",
  revisao: "Revisão manual",
  exclusoes: "Candidatos à exclusão",
  historico: "Histórico de processamento",
  configuracoes: "Configurações",
};

interface HeaderProps { onMenuClick: () => void }

export default function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);
  const secao = pathname.split("/")[1] || "dashboard";
  const titulo = titulos[secao] || "Precifica Operações";

  async function sair() {
    if (saindo) return;
    setSaindo(true);
    try {
      await getSupabaseBrowser().auth.signOut();
    } catch (error) {
      console.error("Falha ao encerrar sessão:", error);
    } finally {
      router.replace("/login");
      router.refresh();
      setSaindo(false);
    }
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-19 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onMenuClick} aria-label="Abrir menu" className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 lg:hidden"><Menu size={24} /></button>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-400">Precifica Operações / Workspace</p>
          <h2 className="truncate text-base font-bold text-slate-900 md:text-lg">{titulo}</h2>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 sm:flex"><ShieldCheck size={15} /> Acesso administrativo</span>
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-sm font-bold text-blue-700" aria-label="Administrador">AD</div>
        <button type="button" onClick={sair} disabled={saindo} title="Encerrar sessão" aria-label="Sair do sistema" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"><LogOut size={17} /> <span className="hidden sm:inline">{saindo ? "Saindo..." : "Sair"}</span></button>
      </div>
    </header>
  );
}

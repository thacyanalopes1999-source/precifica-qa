
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UploadCloud,
  GitCompareArrows,
  ClipboardCheck,
  Trash2,
  History,
  Settings,
  ShieldCheck,
  X,
  PackageCheck,
} from "lucide-react";

const menus = [
  { nome: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { nome: "Importar arquivos", href: "/importar", icon: UploadCloud },
    { nome: "Validar URLs", href: "/validar-urls", icon: UploadCloud },
  { nome: "Comparações", href: "/comparacoes", icon: GitCompareArrows },
  { nome: "Revisão manual", href: "/revisao", icon: ClipboardCheck },
  { nome: "Exclusões", href: "/exclusoes", icon: Trash2 },
  { nome: "Histórico", href: "/historico", icon: History },
  { nome: "Configurações", href: "/configuracoes", icon: Settings },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-67 flex-col
          bg-[#101827] text-white shadow-xl transition-transform
          duration-300 lg:translate-x-0
          ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-21 items-center justify-between border-b border-white/10 px-6">
          <Link href="/dashboard" onClick={onClose} className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600">
              <PackageCheck size={25} />
            </div>

            <div>
              <h1 className="text-xl font-bold tracking-tight">Precifica</h1>
              <p className="text-[11px] font-semibold tracking-[0.2em] text-blue-400">
                QA PLATFORM
              </p>
            </div>
          </Link>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar navegação"
            className="lg:hidden"
          >
            <X size={22} />
          </button>
        </div>

        <div className="px-5 pt-7">
          <p className="mb-4 px-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Área de trabalho
          </p>

          <nav className="space-y-1.5" aria-label="Navegação principal">
            {menus.map((menu) => {
              const Icon = menu.icon;
              const ativo =
                pathname === menu.href ||
                pathname.startsWith(menu.href + "/");

              return (
                <Link
                  key={menu.href}
                  href={menu.href}
                  onClick={onClose}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3
                    text-sm font-medium transition-colors
                    ${
                      ativo
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30"
                        : "text-slate-400 hover:bg-white/8 hover:text-white"
                    }`}
                >
                  <Icon size={19} strokeWidth={1.9} />
                  <span>{menu.nome}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto space-y-4 p-5">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-blue-400">
              <ShieldCheck size={19} />
              <span className="text-xs font-bold">QA Seguro</span>
            </div>
            <p className="text-xs leading-5 text-slate-400">
              Nenhum produto será excluído sem revisão e aprovação humana.
            </p>
          </div>

          <div className="border-t border-white/10 pt-4 text-center text-xs text-slate-500">
            Precifica QA • Versão inicial
          </div>
        </div>
      </aside>
    </>
  );
}

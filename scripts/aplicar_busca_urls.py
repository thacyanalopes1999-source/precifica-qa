#!/usr/bin/env python3
"""Instala patch Buscar URLs preservando outros módulos do Precifica QA."""
from datetime import datetime
from pathlib import Path
import shutil
import sys

ROOT = Path.cwd().resolve()
SRC = ROOT / "precifica_busca_urls"
if not (ROOT / "package.json").exists() or not (ROOT / "src/components/layout/Sidebar.tsx").exists():
    sys.exit("Execute na raiz do Precifica QA (onde está package.json).")
if not SRC.exists():
    sys.exit("Pasta precifica_busca_urls não encontrada. Extraia o ZIP na raiz do projeto.")

files = [
    "src/app/buscar-urls/page.tsx",
    "src/app/buscar-urls/layout.tsx",
    "src/app/api/qa/buscar-url/route.ts",
    "docs/BUSCA_URLS.md",
    "modelos/exemplo_buscar_urls.txt",
]
backup = ROOT / ".precifica-qa-backups" / ("buscar-urls-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
sidebar = ROOT / "src/components/layout/Sidebar.tsx"
old = sidebar.read_text(encoding="utf-8")
new = old
if 'href: "/buscar-urls"' not in new:
    target = '{ nome: "Validar URLs", href: "/validar-urls"'
    if target not in new:
        target = '{ nome: "Importar arquivos", href: "/importar"'
    idx = new.find(target)
    if idx < 0: sys.exit("Menu não reconhecido. Atualize manualmente a Sidebar e contate suporte.")
    line_start = new.rfind("\n", 0, idx) + 1
    indent = new[line_start:idx]
    new = new[:line_start] + indent + '{ nome: "Buscar URLs", href: "/buscar-urls", icon: Search },\n' + new[line_start:]
    if "  Search,\n" not in new:
        new = new.replace("  Settings,", "  Search,\n  Settings,", 1)
        if "  Search,\n" not in new:
            sys.exit("Não foi possível inserir o ícone Search no menu.")

for rel in files:
    source = SRC / rel
    dest = ROOT / rel
    if not source.exists(): sys.exit("Falta arquivo no ZIP: " + rel)
    if dest.exists():
        backup_file = backup / rel
        backup_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(dest, backup_file)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, dest)
if new != old:
    backup_sidebar = backup / "src/components/layout/Sidebar.tsx"
    backup_sidebar.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(sidebar, backup_sidebar)
    sidebar.write_text(new, encoding="utf-8")
print("\n[OK] Aba Buscar URLs instalada e menu atualizado.")
print("[OK] Python/Render e tabelas Supabase não foram alterados.")
if backup.exists(): print("[OK] Backup em:", backup)
print("\nPRÓXIMO: npm install read-excel-file && npm run build")
print("Opcional para buscas automáticas: SERPER_API_KEY nas variáveis da Vercel (somente servidor).")

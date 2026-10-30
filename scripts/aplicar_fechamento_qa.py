#!/usr/bin/env python3
"""Aplica patch de Exclusões e Informações do Sistema com backup externo ao repo.
Uso: python3 scripts/aplicar_fechamento_qa.py
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import shutil
import sys

root = Path(__file__).resolve().parent.parent
payload = root / "precifica_qa_atualizacao"
required = [root / "package.json", root / "src/lib/supabase/browser.ts", root / "src/lib/qa/auth.ts", root / "src/app/api/qa/revisar/route.ts"]
missing = [str(p.relative_to(root)) for p in required if not p.is_file()]
if missing:
    sys.exit("Projeto incompatível ou pasta errada. Não foram encontrados: " + ", ".join(missing))
if not payload.is_dir():
    sys.exit("Diretório precifica_qa_atualizacao/ ausente. Extraia o ZIP na raiz do projeto.")
files = sorted(p for p in payload.rglob("*") if p.is_file())
if not files or not any(p.name == "ExclusoesPainel.tsx" for p in files):
    sys.exit("Patch incompleto. Extraia novamente o ZIP.")
backup = root.parent / "precifica-qa-backups" / ("fechamento-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
backup.mkdir(parents=True, exist_ok=True)
count_backups = 0

def backup_file(target: Path) -> None:
    global count_backups
    if target.is_file():
        dest = backup / target.relative_to(root)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, dest)
        count_backups += 1

for source in files:
    relative = source.relative_to(payload)
    target = root / relative
    backup_file(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)

sidebar = root / "src/components/layout/Sidebar.tsx"
if sidebar.is_file():
    original = sidebar.read_text(encoding="utf-8")
    patched = original.replace('nome: "Configurações", href: "/configuracoes"', 'nome: "Informações do sistema", href: "/configuracoes"')
    patched = patched.replace("Precifica QA • Versão inicial", "Precifica QA • Motor 10.1.0.1")
    if patched != original:
        backup_file(sidebar)
        sidebar.write_text(patched, encoding="utf-8")
        print("Menu lateral atualizado sem substituir outras alterações.")
    else:
        print("Menu lateral já atualizado ou personalizado; preservado.")
else:
    print("Menu lateral não encontrado; não foi alterado.")

print(f"Arquivos instalados: {len(files)}")
print(f"Backups de arquivos existentes: {count_backups}")
print(f"Backup: {backup}")
print("Próximo passo: npm run build; depois git add/commit/push somente se concluir sem erros.")

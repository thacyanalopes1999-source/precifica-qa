#!/usr/bin/env python3
"""Corrige a API de leitura de XLSX no modulo Buscar URLs sem sobrescrever a pagina."""
from pathlib import Path
from datetime import datetime
import shutil
import sys

root = Path.cwd()
p = root / 'src/app/buscar-urls/page.tsx'
if not (root / 'package.json').is_file() or not p.is_file():
    sys.exit('ERRO: execute na raiz do Precifica QA com a aba Buscar URLs instalada.')

old_import = 'const { default: readXlsxFile } = await import("read-excel-file/browser");'
old_call = 'const raw = await readXlsxFile(file);'
new_import = 'const { readSheet } = await import("read-excel-file/browser");'
new_call = 'const raw = await readSheet(file);'
src = p.read_text(encoding='utf-8')
if new_import in src and new_call in src:
    print('OK: Buscar URLs ja possui a correcao de importacao XLSX.')
    sys.exit(0)
if src.count(old_import) != 1 or src.count(old_call) != 1:
    sys.exit('ERRO: padrao original nao encontrado. Nenhum arquivo alterado; revise as linhas 138-144.')
backup = root / '.precifica-qa-backups' / f'buscar-urls-excel-{datetime.now():%Y%m%d-%H%M%S}'
backup.mkdir(parents=True, exist_ok=False)
shutil.copy2(p, backup / 'page.tsx')
updated = src.replace(old_import, new_import, 1).replace(old_call, new_call, 1)
p.write_text(updated, encoding='utf-8')
print(f'OK: leitura XLSX corrigida em {p.relative_to(root)}')
print(f'Backup: {backup / "page.tsx"}')
print('Execute: npm run build')

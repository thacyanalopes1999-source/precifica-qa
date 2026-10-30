"""Add a new link to an existing Next.js sidebar menu *without* changing other entries.
Supports a menu array of object literals containing href/path and a label.
If layout is not recognized, leaves files unchanged and prints a manual guide.
"""
from pathlib import Path
import re
import sys

root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
source = root / "src"
if not source.exists():
    source = root
if not source.exists():
    raise SystemExit("Não encontrei a pasta do projeto.")
candidates = sorted(set([*source.glob("**/*.tsx"), *source.glob("**/*.ts")]))
found = []
for p in candidates:
    if p.name == "page.tsx" or "node_modules" in p.parts or "validar-urls" in p.parts:
        continue
    try:
        content = p.read_text(encoding="utf-8")
    except OSError:
        continue
    if "Importar arquivos" in content and ("/importar" in content or "href:" in content):
        found.append((p,content))

if any('/validar-urls' in code for _,code in found):
    print("[OK] 'Validar URLs' já consta no menu.")
    sys.exit(0)

for p,code in found:
    matches = list(re.finditer(r'\{[^{}]{0,500}\}', code, flags=re.S))
    for m in matches:
        obj = m.group(0)
        if "Importar arquivos" not in obj or not re.search(r'''(?:href|path|url)\s*:\s*['"]/importar['"]''', obj):
            continue
        new = obj.replace("Importar arquivos", "Validar URLs")
        new = re.sub(r'''(['"])/importar\1''', lambda mm: f'{mm.group(1)}/validar-urls{mm.group(1)}', new)
        # Reuse the existing imported icon to avoid breaking the JSX/TSX import.
        patched = code[:m.end()] + ",\n    " + new + code[m.end():]
        if patched == code:
            continue
        backup = p.with_name(p.name + ".before-url-validator.bak")
        backup.write_text(code, encoding="utf-8")
        p.write_text(patched, encoding="utf-8")
        print(f"[OK] Aba 'Validar URLs' acrescentada em: {p.relative_to(root)}")
        print(f"[INFO] Backup criado: {backup.name}")
        sys.exit(0)

# Fallback para barras laterais com <Link href="/importar">...</Link> escritos manualmente.
for p,code in found:
    for pattern in (r'<Link\b[^>]*\bhref\s*=\s*[\"\']/importar[\"\'][^>]*>[\s\S]{0,1200}?</Link>',
                    r'<a\b[^>]*\bhref\s*=\s*[\"\']/importar[\"\'][^>]*>[\s\S]{0,1200}?</a>'):
        for m in re.finditer(pattern, code):
            old = m.group(0)
            if "Importar arquivos" not in old or old.count("<Link") > 1:
                continue
            new = old.replace('"/importar"', '"/validar-urls"').replace("'/importar'", "'/validar-urls'").replace("Importar arquivos", "Validar URLs")
            patched = code[:m.end()] + "\n" + new + code[m.end():]
            backup = p.with_name(p.name + ".before-url-validator.bak")
            backup.write_text(code, encoding="utf-8")
            p.write_text(patched, encoding="utf-8")
            print(f"[OK] Link da aba criado em: {p.relative_to(root)}")
            sys.exit(0)

print("[ATENÇÃO] Página instalada, mas o menu usa uma estrutura personalizada e não foi modificado automaticamente.")
print("Adicione um item com título 'Validar URLs' e href '/validar-urls' no componente da barra lateral.")
print("A página já está disponível em http://192.168.100.22:3000/validar-urls")
sys.exit(0)

# Instale APÓS extrair o ZIP na raiz do projeto do Precifica QA.
# Adiciona uma única linha de include_router, preserva o restante do motor v10.
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path '.').Path
$mainPath = '.\backend\app\main.py'
$routerPath = '.\backend\app\url_validator.py'
$pagePath = '.\src\app\validar-urls\page.tsx'
if (!(Test-Path $mainPath) -or !(Test-Path $routerPath) -or !(Test-Path $pagePath)) {
    throw 'Arquivos não encontrados. Extraia todo o ZIP em C:\Users\Lopes\precifica-qa e execute novamente.'
}
$main = Get-Content $mainPath -Raw -Encoding UTF8
if ($main -notmatch 'app\.include_router\(url_validator_router\)') {
    $backup = "$mainPath.bak_urls_$(Get-Date -Format 'yyyyMMddHHmmss')"
    Copy-Item $mainPath $backup -Force
    Add-Content -Path $mainPath -Encoding UTF8 -Value "`n# Precifica QA: módulo de validação de URLs (independente do comparador)`nfrom app.url_validator import router as url_validator_router`napp.include_router(url_validator_router)`n"
    Write-Host "[OK] Endpoints adicionados sem substituir o motor. Backup: $backup" -ForegroundColor Green
} else {
    Write-Host '[OK] Endpoints já estão instalados.' -ForegroundColor Green
}
$python = '.\backend\.venv\Scripts\python.exe'
if (!(Test-Path $python)) { $python = 'python' }
& $python .\scripts\add_nav.py .
if ($LASTEXITCODE -ne 0) { throw 'Erro ao tentar localizar/adicionar a aba ao menu.' }
Write-Host ''
Write-Host 'Instalado! Reinicie Python e Next.js; abra /validar-urls.' -ForegroundColor Green

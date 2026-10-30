PRECIFICA QA - IMPORTACAO E COMPARACAO MVP

1) Copiar backend/requirements.txt e backend/app/main.py para o seu projeto.
2) Copiar src/app/importar/page.tsx para o seu projeto Next.js.
3) No PowerShell, dentro da pasta precifica-qa:
   py -m venv backend\.venv
   .\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
4) Inicializar a API (na raiz precifica-qa):
   .\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload --port 8000
5) Em outro terminal, iniciar Next.js:
   npm run dev
6) Abrir http://localhost:3000/importar
7) Selecionar cada arquivo, conferir colunas e iniciar comparação.

OBSERVACOES:
- MVP local, limite 10000 linhas e 25 MB por arquivo; não é a versão de 500 mil.
- Suporta extensões explicitamente listadas. TXT: uma descrição por linha.
- A seleção de candidatos por tokens pode perder similares sem palavras em comum.
- Comparação bidirecional é sobre o conjunto de candidatos, não todas as combinações.
- Matching 1:1 guloso não garante associação globalmente ótima.
- Todos os resultados exigem revisão humana; nenhum produto é excluído.
- Exportar CSV antes de fechar o navegador: decisões não são persistidas.
- NÃO publicar esta API na Internet sem autenticação, limites e validação adicional.

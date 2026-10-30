# Precifica Operações — módulo Buscar URLs

## Objetivo

Enriquecer uma base de produtos com URLs **candidatas** de marketplaces, usando descrição e código de barras. Nenhum link é confirmado automaticamente e nenhum produto é excluído ou modificado.

## Onde fica

- Interface Next.js: `src/app/buscar-urls/page.tsx`
- Layout Next.js: `src/app/buscar-urls/layout.tsx`
- API de pesquisa: `src/app/api/qa/buscar-url/route.ts`
- Navegação: `src/components/layout/Sidebar.tsx`
- Provedor externo: Serper (`https://google.serper.dev/search`), chamado exclusivamente pelo servidor Next.js na Vercel.
- Backend Python no Render: continua independente; este módulo não o modifica.

## Dependência

No projeto Next.js: `npm install read-excel-file`. O pacote permite ler XLSX/XLSM localmente no navegador, sem enviar a planilha ao provedor externo.

## Variáveis de ambiente

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: login.
- `SUPABASE_SERVICE_ROLE_KEY`, `QA_ADMIN_USER_ID`: autorização do administrador no servidor.
- `SERPER_API_KEY`: chave **privada** opcional para procurar automaticamente candidatos. Configurar apenas na Vercel, sem prefixo `NEXT_PUBLIC_`.

A API `/api/qa/buscar-url` exige Bearer JWT autenticado e UID autorizado, além de origem válida para POST. Os termos da consulta enviados ao Serper contêm descrição, EAN apenas quando plausivelmente completo e domínio de loja, portanto **não use informações privadas** nas descrições.

## Funcionalidades

1. Importa CSV, TSV, TXT, XLSX e XLSM, até 12 MB e 5.000 linhas por lote. Também aceita colunas copiadas e coladas de Excel/ONLYOFFICE.
2. Detecta colunas `Descrição` e `Código de Barras` ou assume as duas primeiras colunas se não existir cabeçalho.
3. Agrupa linhas idênticas para reduzir buscas; o CSV exportado preserva todas as ocorrências e sua linha original.
4. Permite selecionar até 3 marketplaces por pesquisa. Pesquisa automática consulta sites via SERP API; busca manual abre um mecanismo de busca com filtro por loja.
5. Mostra candidatos e uma medida aproximada de sobreposição textual. Exige que o usuário confira marca, tamanho, modelo e EAN antes de clicar em **Selecionar URL**.
6. Permite colar URLs de domínios conhecidos; exporta CSV com `Situação`, inclusive linhas pendentes.

## Limitações e regras de negócio

- **EAN em notação científica é inseguro.** Valores como `7.901E+12` podem estar arredondados; o código original é preservado, mas não é usado como identificador exato. Prefira formatar a coluna como texto na origem, sem perda de dígitos.
- Título parecido não comprova que é a mesma variação/SKU. A pontuação é informativa; nunca configura `MATCH` do motor de comparações.
- Uma URL do marketplace pode retornar estoque esgotado, redirecionar ou mudar; use a funcionalidade **Validar URLs** para verificar links salvos.
- A busca automática depende de créditos, índices e resultados fornecidos pelo Serper/Google, e não de APIs oficiais de catálogo das lojas. Pode não encontrar todos os produtos, ou oferecer resultados imprecisos.
- A pesquisa em lote é intencionalmente limitada a cinco produtos distintos por ação, e no máximo três lojas por produto, para evitar requisições e custo excessivos.
- **Persistência:** as seleções são temporárias e precisam ser exportadas. Não foram criadas tabelas Supabase nem gravadas escolhas automaticamente.
- **Grandes volumes:** 500 mil linhas exigiriam processamento em fila, controles de rate limit e orçamento. Não executar em Vercel/Render Free sem esse desenho.

## Homologação

1. Confirme que `npm run build` passou e que o deploy da Vercel está Ready.
2. Entre com o usuário administrador.
3. Em Buscar URLs, importe `modelos/exemplo_buscar_urls.txt`.
4. Confira que 4 linhas viram 3 produtos distintos e um código em notação científica exige revisão.
5. Com `SERPER_API_KEY` configurada, pesquise o primeiro produto; sem chave, confirme a busca manual por loja.
6. Confira um anúncio no navegador, selecione a URL e exporte CSV.
7. Confirme que nenhuma alteração foi feita nas tabelas de produtos ou no motor Python.

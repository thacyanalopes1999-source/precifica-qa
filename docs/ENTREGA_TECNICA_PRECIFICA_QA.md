# Precifica Operações — Precifica QA
## Manual de operação, arquitetura e passagem para a equipe da empresa
**Edição de referência:** 30/10/2026. **Escopo:** páginas Exclusões e Informações do Sistema, mais a base de código já publicada.

> Este documento se baseia no código disponibilizado e nas implantações confirmadas pelo usuário. Os números de versão do motor e de releases da interface não são sinônimos. Não constitui homologação de desempenho, segurança ou precisão comercial.

## 1. Visão funcional
Precifica QA é o módulo de análise de produtos da plataforma Precifica Operações. Importa Base A e Base B, lê colunas de descrição, compara descrições e evidências comerciais, devolve resultados classificáveis, permite revisão humana e exportação. Não remove registros de catálogos nem planilhas automaticamente.

**Modos:**
- **Linha a linha:** exige as duas bases com o mesmo número de linhas e compara posições correspondentes, sem buscar em outras posições.
- **Cruzamento 1:1:** procura candidatos em outras posições, indexando tokens e aplicando heurísticas para associar cada ocorrência de B a no máximo uma ocorrência de A. Não garante solução ótima global.

**Classificações do motor:** `MATCH_SUGERIDO`, `REVISAR`, `DIFERENTE`, `VINCULO_PENDENTE`, `SEM_CANDIDATO`. O modo linha a linha não gera `VINCULO_PENDENTE`. A saída fornece score, linhas de origem, descrições, faixa e justificativa.

## 2. Regras de negócio verificadas
1. **Score não decide sozinho:** similaridade textual é um indicador, não prova de equivalência. A interface antiga que dizia “50–100% MATCH; 20–49% REVISAR” não representa a lógica real do motor `backend/app/main.py`.
2. **Identidade comercial:** família do produto, marca, EAN válido, modelo, variantes e atributos são avaliados. Atributos incluem cor, tamanho, voltagem, capacidades, medidas, tipo de produto, RAM/armazenamento e casos especializados.
3. **EAN igual com conflito:** exige `REVISAR` quando há incompatibilidade de atributos comerciais ou cadastro.
4. **Incompatibilidade comprovada:** família, marca ou variante comercial claramente conflitante pode gerar `DIFERENTE` mesmo com score alto.
5. **Sem candidato:** resultado `SEM_CANDIDATO` significa ausência de candidato localizado no processamento. Não comprova ausência na base e não autoriza exclusão real.
6. **Revisão humana:** resultados são apresentados com status de revisão. Aprovar/descartar/reabrir na página Exclusões **apenas atualiza `qa_resultados.status_revisao`**.
7. **Limites configurados:** 200 MB por arquivo; 500.000 linhas por base; até 35 candidatos indexados por registro A. Esses limites **não são capacidade de processamento homologada** no Render Free.

## 3. Persistência: contrato entre motor e Supabase
O frontend possui fluxo de salvamento explícito, em lotes, em `src/app/api/qa/salvar/route.ts`. Uma análise não salva não entra no Dashboard, Comparações ou Exclusões. O estado `SEM_CANDIDATO` é persistido como `classificacao = 'exclusao'` e `status_revisao = 'pendente'` inicialmente.

| Origem no Python | Classificação salva no Supabase |
|---|---|
| `MATCH_SUGERIDO` | `match` |
| `REVISAR`, `VINCULO_PENDENTE`, `DIFERENTE`, `CONFLITO_1_1` | `revisar` |
| `SEM_CANDIDATO` | `exclusao` |

**Tabelas usadas no código:** `qa_comparacoes` (identificador, arquivos, nome, status, datas) e `qa_resultados` (resultado, comparação associada, descrições, linhas, score, classificação, status da revisão, motivo). A persistência deve ter índice/único de `(comparacao_id, produto_a_id)` para permitir upsert idempotente por lote. **Verifique o esquema real no Supabase antes de migrar**, pois não foi fornecido o DDL completo de produção.

**Exclusões:** a nova rota `GET /api/qa/exclusoes` exige autenticação administrativa, consulta somente `classificacao='exclusao'`, permite filtrar por status, texto e comparação, devolve contagens e paginação. A nova página oferece exportação CSV **somente da página visível** e confirmação individual para validar, descartar ou reabrir. Nenhuma rota de DELETE foi adicionada.

## 4. Arquitetura e hospedagem

```
 Navegador (login Supabase Auth)
       |
       v
 Vercel: Next.js 16.4.2 / React 19.3.0 / TypeScript
       | \-- /api/qa/* (backend administrativo com JWT e UID)
       |                        |
       |                        +-- Supabase PostgreSQL / Auth
       |
       +-- HTTPS --> Render: FastAPI / Uvicorn / Python
                         | /health /preview /compare /export
                         +-- utilitários de validação de URLs

 GitHub: thacyanalopes1999-source/precifica-qa (branch main)
```

- **Aplicação Vercel:** https://precifica-qa.vercel.app
- **API Render:** https://precifica-qa-api.onrender.com ; diagnóstico https://precifica-qa-api.onrender.com/health
- **Código-fonte:** https://github.com/thacyanalopes1999-source/precifica-qa
- **Banco:** Supabase, projeto denominado `precifica-qa`, região informada `us-west-2` em 30/10/2026.
- **Frontend:** Next.js `16.4.2`, React `19.3.0`, TypeScript, Tailwind CSS 4, `@supabase/supabase-js` 2.x (conforme package.json da base revisada).
- **Motor:** FastAPI em `backend/app/main.py`; `/health` reportou `versao_motor=10.1.0.1`. Alterações nomeadas `V11.1` são releases/patches do projeto e **não mudam automaticamente esse identificador**.
- **Python:** interpretador 3.x; logs do Render de 30/10/2026 mostraram wheels `cp314`, indicando execução na linha Python 3.14 naquele build. **Confirmar a versão efetiva em Environment no Render antes da migração**. Bibliotecas: FastAPI, Uvicorn, Pandas, RapidFuzz, openpyxl, pyarrow, leitores de formatos e outros em `backend/requirements.txt`.
- **Render Free:** 512 MB RAM, 0,1 CPU, hiberna após inatividade, sem disco persistente. Não é homologado para 500 mil linhas e pode ser inadequado para uso empresarial.

## 5. Estrutura do repositório
| Caminho | Finalidade |
|---|---|
| `src/app/importar/page.tsx` | Importação, prévia, comparação e exportação |
| `src/app/exclusoes/page.tsx` | Página operacional de exclusões |
| `src/components/exclusoes/ExclusoesPainel.tsx` | Filtros, indicadores, fila, confirmação e exportação |
| `src/app/api/qa/exclusoes/route.ts` | Consulta segura de candidatos via Supabase |
| `src/app/api/qa/revisar/route.ts` | Atualiza apenas `status_revisao` |
| `src/app/api/qa/salvar/route.ts` | Persistência explícita em lotes |
| `src/app/api/qa/consultar/route.ts` | Dashboard, comparação, revisão e histórico |
| `src/lib/qa/auth.ts` | Verificação de token Supabase e UID de administrador |
| `src/lib/supabase/admin.ts` | Cliente privilegiado, apenas no servidor |
| `src/lib/supabase/browser.ts` | Login e envio de token pelo navegador |
| `src/app/configuracoes/page.tsx` | Informações do sistema (leitura, não edita regras) |
| `src/components/configuracoes/ConfiguracoesSistema.tsx` | Arquitetura, regras, tecnologias e status da API |
| `backend/app/main.py` | API de processamento FastAPI |
| `backend/app/services/` | Serviços de normalização e comparação |
| `backend/app/url_validator.py` | Validação de URLs |
| `backend/requirements.txt` | Dependências do backend |
| `package.json` | Dependências e comandos web |

## 6. Deploy e variáveis de ambiente
**Vercel:** conectada ao GitHub, branch `main`, diretório raiz `./`, framework Next.js. Build normal: `npm ci && npm run build`.

**Render:** conectada ao mesmo GitHub, branch `main`, diretório `backend/`. Build: `pip install -r requirements.txt`. Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Health check: `/health`.

| Variável | Serviço | Finalidade |
|---|---|---|
| `NEXT_PUBLIC_QA_API_URL` | Vercel | API HTTPS no Render |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel | Chave pública para Supabase Auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (servidor) | Chave administrativa; nunca NEXT_PUBLIC |
| `QA_ADMIN_USER_ID` | Vercel (servidor) | UID que terá acesso administrativo |
| `PORT` | Render | Porta definida pelo provedor |
| `PYTHON_VERSION` | Render, quando configurada | Fixar versão de runtime |

Não colocar senhas ou chaves em `.env.example`, docs, planilhas, arquivos versionados ou prints. Configurar valores reais pelos painéis dos serviços; verificar escopo **Production**. Após alterar env de frontend, disparar novo deploy do commit mais recente.

## 7. Controles e lacunas antes de uso empresarial
**Existentes:** autenticação via Supabase Auth na UI; rotas `src/app/api/qa/*` verificam JWT no servidor e comparam UID autorizado; chave privilegiada fica no servidor; registro de estado de revisão; decisão individual confirmada na interface; nenhuma exclusão automática.

**A implementar/homologar antes da entrega:**
1. Autenticação e limites de chamadas no **FastAPI público do Render**. O login Next.js não protege diretamente os endpoints públicos do Python.
2. Auditoria imutável das revisões (autor, timestamp, decisão anterior/nova, justificativa) e políticas de retenção. Hoje somente o status atual de revisão é persistido.
3. Permissões por equipe/empresa e separação multi-tenant, se houver mais de um cliente. O modelo atual usa um UID administrativo.
4. LGPD: classificação dos dados, política de privacidade, retenção, criptografia/chaves, backup, restauração, acessos mínimos e resposta a incidentes.
5. Testes de carga de 1k/10k/50k/500k linhas, tempo, RAM, fila de jobs e timeout; as bases de 500 mil podem exigir serviços pagos, background jobs, streaming ou processamento por lotes.
6. Testes de acurácia com amostra rotulada por humanos; não equiparar score a acurácia comprovada.
7. Migração de titularidade da Vercel, GitHub, Render e Supabase para contas da empresa, gestão de faturamento, credenciais por função, domínios e backups testados.
8. Verificação de índices, esquema SQL, constraints e RLS do Supabase; limitações da API administrativa sob `service_role`.
9. Verificar política de limites/uso de hospedagem gratuita e migrar para plano adequado à operação empresarial.

## 8. Procedimento de validação antes da entrega
```bash
# Na raiz do repositório
npm ci
npm run build
python3 -m py_compile backend/app/main.py
curl -sS https://precifica-qa-api.onrender.com/health
```
Na Vercel: fazer login com usuário de teste do Supabase Auth, verificar `/dashboard`, `/importar`, `/comparacoes`, `/revisao`, `/exclusoes` e `/configuracoes`. Usar bases de teste pequenas e não sensíveis. Comparar, **salvar**, conferir contagens no banco, revisar sinalização e verificar status. Reabrir revisão. Exportar CSV da página e conferir sanitização de células. Confirmar que acessos sem autenticação à rota `/api/qa/exclusoes` retornam 401/403.

### Diagnóstico rápido
- **Erro de CORS:** verificar `allow_origins` em `backend/app/main.py` e o domínio da Vercel; conferir no Render o commit que está Live.
- **`Failed to fetch`:** verificar `/health`, status do serviço, CORS, tamanho do arquivo e Logs do Render; em Free pode ocorrer cold start.
- **401/403 nas rotas admin:** validar sessão do Supabase Auth e `QA_ADMIN_USER_ID`; não contornar autenticação.
- **500 por banco:** validar nomes das tabelas, permissões e constraints no Supabase; nunca expor a service key no navegador.
- **Dados zerados:** uma análise só entra nos indicadores após ser salva no Supabase; conferir projeto/ambiente correto.
- **Build Next falha:** executar `npm run build` local e verificar compatibilidade do App Router/Cache Components; não fazer redeploy de commit antigo.

---
**Status da entrega:** a interface e documentação foram implementadas em pacote incremental. A implantação final depende da compilação no ambiente do usuário, de novo commit e do deploy. Não declarar o sistema como homologado para produção sem completar os itens de segurança e carga acima.

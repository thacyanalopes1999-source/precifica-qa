PRECIFICA QA - PERSISTENCIA DE COMPARACOES

1. Faça backup de src/app/importar/page.tsx.
2. Extraia este ZIP na RAIZ C:\Users\Lopes\precifica-qa e confirme substituicao da pagina /importar.
3. Verifique se ja existem as tabelas qa_comparacoes e qa_resultados (SQL da conversa anterior).
4. Confirme .env.local com URL BASE (sem /rest/v1/) e chave secreta valida, nunca compartilhe.
5. Reinicie npm run dev. Mantenha backend Python executando.
6. Abra http://localhost:3000/importar, selecione arquivos, compare e clique em 'Salvar no Supabase'.
7. Quando conclui, o dashboard mostra os dados reais. O salvamento preserva o status de revisao PENDENTE.
8. Esta rota de gravacao e exclusivamente para desenvolvimento local, sem autenticacao. NAO implantar em producao.

LIMITACOES:
- O salvamento ocorre APOS o retorno da comparacao; uma falha nao impede baixar CSV.
- Revisão manual feita na tela de importar NAO e enviada ao banco; trabalharemos nisso na proxima etapa.
- Nomes de arquivos sao armazenados, conteudo original dos arquivos nao.
- Dados de resultados (descricao/score) sao armazenados no Supabase.
- O backend Python atual aceita ate 10 mil linhas; 500 mil exige outra arquitetura.

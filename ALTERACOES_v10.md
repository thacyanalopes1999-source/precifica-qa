# Precifica QA v10 — Changelog

- Contrato da API mantido (`/health`, `/preview`, `/compare`, `/export`).
- Família, marca, modelo e características comerciais passam a decidir o status antes do score textual.
- Identificadores EAN/GTIN inválidos deixam de ser usados como evidência.
- Distingue RAM de armazenamento e ignora dimensões logísticas após `Dimensões (A x L x P)`.
- Identifica variantes de perfume (EDP/EDT), voltagem (110/127 vs 220), cor, tamanho, formulação e geração.
- Reconhece mais famílias e evita interpretar um balcão para micro-ondas como um micro-ondas.
- Motivo por linha registra o tipo de conflito e evidências reconhecidas.
- Mantidos CORS, limite de 500 mil linhas, exportação grande e revisão humana obrigatória.

**Aviso:** atualização candidata para validação. Os testes de regressão não representam 99% de acurácia medida.

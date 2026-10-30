"""Audita resultados exportados pela v10, sem alterar a base Supabase.

Uso: python auditar_correcao_v10_1_0_1.py arquivo.tsv
"""
import argparse,csv,sys,time
from collections import Counter
from pathlib import Path
from backend.app import main as motor

def main(path, output=None):
    path = Path(path)
    out = Path(output) if output else path.with_name('auditoria_mudancas_v10_1_0_1.csv')
    changes = Counter(); total=Counter(); examples=[]; counted=0
    with path.open('r',encoding='utf-8-sig',newline='') as inp, out.open('w',encoding='utf-8-sig',newline='') as fp:
        r=csv.DictReader(inp,delimiter='\t')
        required={'Descrição','Produto Monitorado','QA_STATUS'}
        if not required.issubset(r.fieldnames or []):
            raise SystemExit('Faltam colunas: '+', '.join(sorted(required-set(r.fieldnames or []))))
        w=csv.writer(fp)
        w.writerow(['LINHA_ARQUIVO','DESCRICAO_A','DESCRICAO_B','SCORE_ANTIGO','STATUS_ANTIGO','STATUS_CORRIGIDO','FAIXA','MOTIVO'])
        for pos,row in enumerate(r,2):
            raw_a=row['Descrição'];raw_b=row['Produto Monitorado'];old=row['QA_STATUS']
            score_str=row.get('QA_SIMILARIDADE_PERCENTUAL') or ''
            try:score=float(score_str.replace(',','.'))
            except (ValueError,AttributeError):
                na=motor.clean_text(motor.split_description(raw_a)[0]); nb=motor.clean_text(motor.split_description(raw_b)[0]);score=motor.score_pair(na,nb)[0]
            status,faixa,motivo=motor.decide_pair(raw_a,raw_b,score,'',{},{});
            counted+=1
            total[status]+=1
            if old != status:
                changes[(old,status)]+=1
                w.writerow([pos,raw_a,raw_b,score_str,old,status,faixa,motivo])
    print('Registros:',counted)
    print('Novos status:',dict(total))
    print('Alteracoes:',dict(changes),'total=',sum(changes.values()))
    print('Arquivo de mudancas:',out)

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('arquivo')
    parser.add_argument('--saida')
    args=parser.parse_args()
    main(args.arquivo,args.saida)

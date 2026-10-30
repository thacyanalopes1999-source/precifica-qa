"""Opcional: leia a exportacao de Revisar em TSV e contabilize v9.2.
Uso: python analisar_revisoes.py arquivo.tsv
Sem EAN nas entradas, a analise NAO substitui reexecutar a comparacao completa.
"""
import csv,sys,collections,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent/'backend'))
from app.main import clean_text,split_description,score_pair,decide_pair
if len(sys.argv)<2: raise SystemExit('Uso: python analisar_revisoes.py arquivo.tsv')
start=time.monotonic(); stats=collections.Counter(); examples=[]
with open(sys.argv[1],encoding='utf-8-sig',newline='') as f:
 for r in csv.DictReader(f,delimiter='\t'):
  a=r['Descrição']; b=r['Produto Monitorado']
  if not a or not b: continue
  na=clean_text(split_description(a)[0]);nb=clean_text(split_description(b)[0]); sc,why,_=score_pair(na,nb)
  status,band,msg=decide_pair(a,b,sc,why,{}, {})
  stats[status]+=1
  if status=='REVISAR' and len(examples)<12:examples.append((a[:48],b[:48],round(sc,1)))
print('Contagens hipoteticas SEM EAN:',dict(stats));print('Tempo:',round(time.monotonic()-start,1),'s')
print('Amostra ainda em REVISAR:');print(*examples,sep='\n')

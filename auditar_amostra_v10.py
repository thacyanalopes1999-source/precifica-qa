import sys,csv,random,collections,time
from pathlib import Path
root=Path(__file__).resolve().parent
sys.path.insert(0,str(root/'backend'))
from app.main import clean_text,split_description,score_pair,decide_pair
files=[('REVISAR','Texto colado(20261023-174512).txt'),('MATCH_SUGERIDO','Texto colado (2)(20261023-174521).txt'),('DIFERENTE','Texto colado (3)(20261023-174535).txt')]
rnd=random.Random(20261023)
trans=collections.defaultdict(collections.Counter)
count=collections.Counter();examples=collections.defaultdict(list)
start=time.time()
for label,fn in files:
 p=Path('/mnt/data')/fn
 reservoir=[];total=0
 with p.open('r',encoding='utf-8-sig',newline='') as f:
  reader=csv.DictReader(f,delimiter='\t')
  for row in reader:
   total+=1
   if len(reservoir)<4000: reservoir.append((total,row))
   else:
    index=rnd.randrange(total)
    if index<4000: reservoir[index]=(total,row)
 print(fn,'total',total,'sample',len(reservoir),flush=True)
 for line,row in reservoir:
  a,b=row['Descrição'],row['Produto Monitorado']; old=row['QA_STATUS']
  na,nb=[clean_text(split_description(s)[0]) for s in (a,b)]
  sc,why,_=score_pair(na,nb)
  status,faixa,reason=decide_pair(a,b,sc,why,{}, {})
  trans[old][status]+=1; count[old]+=1
  if status!=old and len(examples[(old,status)])<12:
   examples[(old,status)].append((a[:140],b[:140],sc,faixa,reason[:180]))
print('TRANS',dict(trans),'elapsed',round(time.time()-start,1),flush=True)
for key,examples_ in examples.items():
 print('\nMOVIMENTO',key,len(examples_))
 for ex in examples_[:5]:print(ex,flush=True)

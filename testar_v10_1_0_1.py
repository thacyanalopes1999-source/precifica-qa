"""Testes adicionais de erro de identidade comercial, v10.1.0.1."""
import json
import sys
from pathlib import Path
from fastapi.testclient import TestClient

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'backend'))
from app.main import app, decide_pair, clean_text, split_description, score_pair

cases=json.loads((ROOT/'casos_regressao_v10_1_0_1.json').read_text(encoding='utf-8'))
passed=0
for i,c in enumerate(cases,1):
    a,b=c['a'],c['b']
    na,nb=[clean_text(split_description(s)[0]) for s in (a,b)]
    score=c['score'] if c['score'] is not None else score_pair(na,nb)[0]
    found,faixa,reason=decide_pair(a,b,score,'',{}, {})
    assert found==c['expected'],f'Falhou #{i}: esperado {c["expected"]}, obtido {found}, score {score}. {reason}. {a} | {b}'
    passed+=1
assert TestClient(app).get('/health').json()['versao_motor']=='10.1.0.1'
print(f'OK: {passed} cenarios comerciais e versao de API validados')

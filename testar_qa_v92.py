"""Testes automatizados da logica de decisao e endpoints de integracao."""
import io, json, sys
from pathlib import Path
from fastapi.testclient import TestClient
import openpyxl
root=Path(__file__).resolve().parent
sys.path.insert(0,str(root/'backend'))
from app.main import app, decide_pair, clean_text, score_pair, split_description, product_type

cases=[
    ('Compressor De Ar Direto Mega Jet CMJ-210 - Ferrari','Pillow Top Espuma Hiper Soft Hipoalergênico BF Colchões','DIFERENTE'),
    ('Torneira celite lotus de parede para lavatorio cromado','Pillow Top Espuma Hiper Soft Hipoalergênico BF Colchões','DIFERENTE'),
    ('Câmera canon eos r50 mirrorless 18-45mm 55-210mm','Óleo Lubrax Essencial 4T para Motos 1 Litro','DIFERENTE'),
    ('Amortecedor dianteiro Ducato / Boxer / Jumper Cofap','Bebedouro Industrial Frisbel 100L','DIFERENTE'),
    ('Torneira Elétrica Para Cozinha De Parede Versátil 127V','Bebedouro Industrial Frisbel Coluna 3 Torneiras Natural e Gelada','DIFERENTE'),
    ('Tênis Olympikus Swift 5 Feminino Cinza e Rosa','Tênis Fila Axion Masculino','DIFERENTE'),
    ('Câmera Canon EOS R50 Mirrorless','Bebedouro Frisbel 100 Litros Coluna Inox','DIFERENTE'),
    ('Cama Caminha Pet Cachorro E Gato Extra Grande 70 x 70 Cinza','Caminha Pet G - Cama pet GRANDE - FUNDO IMPERMEAVEL E COM ZIPER (AZUL MARINHO, G- 70x70cm)','REVISAR'),
    ('Rack Tv Moderno Ate 55 Polegadas Branca Amadeirado','Escrivaninha Rack Tv Sala Home Estante Multiuso Whitemadeira','REVISAR'),
    ('Fogão de Piso Electrolux de 05 Bocas Experience com PerfectCook360 Prata - FE5DC','Fogão 5 Bocas Electrolux Cinza Experience 2 Fornos, PerfectCook360 e Tripla Chama (FE5DC) 220V','REVISAR'),
    ('Furadeira Philco PFU04 127V 850W','Furadeira Philco PFU04 220V 850W','REVISAR'),
    ('Tênis Adidas Duramo 2','Tênis Adidas Duramo 2','MATCH_SUGERIDO'),
    ('Luminária Abajur Mesa de Cabeceira Acoplada Quarto Cama','Luminária Abajur Mesa de Cabeceira Acoplada Quarto Cama','MATCH_SUGERIDO'),
]
for a,b,expected in cases:
    na=clean_text(split_description(a)[0]); nb=clean_text(split_description(b)[0]); sc, reason, _=score_pair(na,nb)
    got,_,why=decide_pair(a,b,sc,reason,{}, {})
    assert got==expected,(a,b,got,expected,why)
# Prioridade seguranca: barcode coincidente em familias incompatíveis => revisao
x='Compressor de ar Ferrari 220V'; y='Pillow Top Espuma Colchões'
sc, reason, _=score_pair(clean_text(x),clean_text(y))
stat,_,_=decide_pair(x,y,sc,reason,{'EAN':'7891234567890'},{'EAN':'7891234567890'})
assert stat=='REVISAR'

sample=("Descrição;Produto Monitorado;Código de Barras;Código de Barras Monitorado\n"
        "Compressor De Ar Mega Jet Ferrari;Pillow Top Espuma Colchões;7891234567890;7891234567891\n"
        "Cama Caminha Pet Grande Cinza;Caminha Pet Grande Azul;7891234567891;7891234567892\n"
        "Tênis Adidas Duramo 2;Tênis Adidas Duramo 2;7891234567892;7891234567892\n")
tc=TestClient(app)
r=tc.post('/compare',files={'file_a':('sample.csv',sample.encode()),'file_b':('sample.csv',sample.encode())},data={'col_a':'Descrição','col_b':'Produto Monitorado','modo':'linha_a_linha'})
assert r.status_code==200,r.text
results=r.json()['resultados']
assert [x['classificacao'] for x in results]==['DIFERENTE','REVISAR','MATCH_SUGERIDO'],results
exp=tc.post('/export',files={'file_a':('sample.csv',sample.encode()),'resultados_json':('resultados.json',json.dumps(results,ensure_ascii=False).encode('utf-8'),'application/json')})
assert exp.status_code==200,exp.text
wb=openpyxl.load_workbook(io.BytesIO(exp.content),read_only=True)
assert len(list(wb.active.values))==4
# Em 1:1, pares claramente incompativeis NAO viram MATCH.
r2=tc.post('/compare',files={'file_a':('sample.csv',sample.encode()),'file_b':('sample.csv',sample.encode())},data={'col_a':'Descrição','col_b':'Produto Monitorado','modo':'cruzamento_1a1'})
assert r2.status_code==200,r2.text
assert all(x['classificacao']!='MATCH_SUGERIDO' for x in r2.json()['resultados'] if x['linha_a']==2),r2.json()
print('OK: 13 casos manuais, EAN conflitante, linhas alinhadas, 1:1 e exportacao XLSX')

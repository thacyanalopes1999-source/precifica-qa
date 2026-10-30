import sys,io,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent/'backend'))
from app.main import app,decide_pair,score_pair,clean_text,split_description,_features_v10,ean_state
from fastapi.testclient import TestClient
import openpyxl
cases=[
('Compressor de Ar Direto Mega Jet CMJ-210 Ferrari','Pillow Top Espuma Hiper Soft Hipoalergenico BF Colchoes','DIFERENTE'),
('Anasol Protetor Solar Facial Clareador FPS 90 60g','Protetor Facial Clareador Toque Seco Anasol FPS90 60g','MATCH_SUGERIDO'),
('Anasol Protetor Solar Facial Clareador FPS 90 60g','Anasol Protetor Solar Facial Clareador FPS 90 60g','MATCH_SUGERIDO'),
('Protetor solar Anasol','Oleo Lubrax moto 4t 20w50','DIFERENTE'),
('Compressor Ar Direto Mega Jet CMJ-210 Ferrari','Compressor Ferrari CMJ-210','MATCH_SUGERIDO'),
('Perfume Boucheron Pour Femme Eau de Parfum 100ml','Boucheron Pour Femme Eau de Toilette Perfume Feminino 100ml','DIFERENTE'),
('Perfume Boucheron Pour Femme Eau de Parfum 100ml','Boucheron Pour Femme Eau de Parfum 50 ml','DIFERENTE'),
('Furadeira Philco PFU04 127V 850W','Philco Furadeira PFU04 220V 850W','DIFERENTE'),
('Furadeira Philco PFU04 127V 850W','Philco Furadeira PFU04 110V 850W','MATCH_SUGERIDO'),
('Tênis Infantil Adidas Runfalcon','Tênis Infantil adidas Runfalcon 6','REVISAR'),
('Tênis Adidas Runfalcon 5','Tênis Adidas Runfalcon 6','DIFERENTE'),
('iPhone 17 Pro Max Apple 256GB Azul intenso','Apple iPhone 17 Pro Max 256 GB Deep Blue','MATCH_SUGERIDO'),
('iPhone 17 Pro Max Apple 256GB Azul intenso','Apple iPhone 17 Plus 256 GB Azul intenso','DIFERENTE'),
('Cama pet 70x70 cinza','Caminha pet G 70x70 Azul Marinho','DIFERENTE'),
('Pillow Top Solteiro Espuma Hiper Soft Hipoalergênico 88x188cm BF Colchões','Pillow Top Espuma Hiper Soft Hipoalergênico BF Colchões','REVISAR'),
('Bebedouro Industrial 100 litros 3 torneiras Frisbel','Bebedouro Industrial Frisbel 100 Litros 3 Torneiras','MATCH_SUGERIDO'),
('Cama Box casal colchao espuma Ortobom','Sofa com colchao dobravel','REVISAR'),
('Balcao para microondas cozinha 2 portas','Forno microondas Panasonic','DIFERENTE'),
('Mobil oleo 20w50 1 litro','Lubrax oleo 20w50 1 litro','DIFERENTE'),
('Tênis Infantil Bibi Roller Fun Menina','Tênis Infantil Bibi Feminino','REVISAR'),
('Livro Daggerheart','Livro Daggerheart','MATCH_SUGERIDO'),
('Daggerheart','Daggerheart','MATCH_SUGERIDO'),
('iPhone 17 Pro Max 256GB 8GB RAM','iPhone 17 Pro Max 256GB 4GB RAM','DIFERENTE'),
('Aspirador Electrolux ERG26','Aspirador de Po Electrolux Ergorapido ERG26','MATCH_SUGERIDO'),
('Fogao Electrolux FE5DC 5 bocas 220V','Fogão Electrolux FE5DC 5 bocas','MATCH_SUGERIDO'),
('Batedeira Planetaria Philco 700W','Batedeira Planetaria Britania 700W','DIFERENTE'),
('Tênis Asics Gel Nimbus 28 Feminino','Tênis Asics Gel Cumulus 28 Feminino','DIFERENTE'),
('Tênis ASICS GEL-Kayano 12.1 Unissex Branco Verde','Tênis ASICS Gel Kayano 12.1 Branco Verde','MATCH_SUGERIDO'),
('Darrow Doctar Sensi Shampoo Anticaspa','Shampoo Anticaspa Darrow Doctar Sensi 120ml','MATCH_SUGERIDO'),
('Mala média cruzeiro expansiva TSA 122M','Mala CRUZEIRO 122M média cadeado TSA','MATCH_SUGERIDO'),
('Tênis Adidas Duramo 2','Tênis Fila Duramo 2','DIFERENTE'),
('Cuba Pia de Apoio Beltempo BT2171 Branca','Cuba Pia Marmorite Coral','DIFERENTE'),
('Black Is White Curaprox Creme Dental 90ml','Creme dental Curaprox Black Is White 90ml','MATCH_SUGERIDO'),
('Rack TV madeira moderno','Escrivaninha rack TV sala multiuso','REVISAR'),
]
fail=[]
for i,(a,b,expect) in enumerate(cases,1):
 na,nb=(clean_text(split_description(x)[0]) for x in (a,b))
 sc,why,_=score_pair(na,nb)
 out,faixa,reason=decide_pair(a,b,sc,why,{}, {})
 if out!=expect:fail.append((i,expect,out,round(sc,1),a,b,reason))
 print(('OK' if out==expect else 'ERRO'),i,expect,out,round(sc,1),a[:30],b[:30])
for x in fail:print('FAIL',x)
print('TOTAL',len(cases),'pass',len(cases)-len(fail),'fail',len(fail))
if fail:exit(1)
assert ean_state({'EAN':'7897230304779'},{'Código de Barras Monitorado':'7897230304779'})=='IGUAL'
assert ean_state({'EAN':'7891234567890'},{'Código de Barras Monitorado':'7891234567890'})=='AUSENTE'
a='Tênis Adidas Duramo 2 Preto';b='Tênis Adidas Duramo 2 Azul'
score,why,_=score_pair(clean_text(a),clean_text(b))
assert decide_pair(a,b,score,why,{'EAN':'7897230304779'}, {'Código de Barras Monitorado':'7897230304779'})[0]=='REVISAR'
assert decide_pair(a,b,score,why,{'EAN':'7897230304779'}, {'Código de Barras Monitorado':'7891234567895'})[0]=='DIFERENTE'
client=TestClient(app)
assert client.get('/health').json()['versao_motor']=='10.1.0.1'
assert client.options('/preview',headers={'Origin':'http://192.168.100.22:3000','Access-Control-Request-Method':'POST'}).headers.get('access-control-allow-origin')=='http://192.168.100.22:3000'
data='Descrição;Produto Monitorado\nCompressor de ar Ferrari;Pillow Top BF Colchoes\nCompressor Mega Jet Ferrari CMJ-210;Compressor Ferrari CMJ-210\nAnasol protetor solar FPS 90;Oleo Lubrax para motos\n'
r=client.post('/compare',files={'file_a':('base.csv',data.encode()),'file_b':('base.csv',data.encode())},data={'col_a':'Descrição','col_b':'Produto Monitorado','modo':'linha_a_linha'})
assert r.status_code==200,r.text
print('linha_a_linha statuses',[x['classificacao'] for x in r.json()['resultados']])
x=r.json()['resultados'];assert [a['linha_a'] for a in x]==[2,3,4]
exp=client.post('/export',files={'file_a':('base.csv',data.encode()),'resultados_json':('r.json',json.dumps(x).encode(),'application/json')})
assert exp.status_code==200,exp.text[:100]
wb=openpyxl.load_workbook(io.BytesIO(exp.content),read_only=True)
assert len(list(wb.active.values))==4
r=client.post('/compare',files={'file_a':('base.csv',data.encode()),'file_b':('base.csv',data.encode())},data={'col_a':'Descrição','col_b':'Produto Monitorado','modo':'cruzamento_1a1'})
assert r.status_code==200,r.text[:200]
print('cross statuses',[x['classificacao'] for x in r.json()['resultados']])
print('ALL ENDPOINTS OK')

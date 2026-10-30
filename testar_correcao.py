
from pathlib import Path
import io
import json
import sys

root = Path(__file__).parent
sys.path.insert(0, str(root / "backend"))
from fastapi.testclient import TestClient
from app.main import app, clean_text, score_pair, decide_pair

cases = [
    ("Protetor Solar Facial FPS 90 60g", "Óleo Lubrax Essencial 4T para Motos 1 Litro", "DIFERENTE"),
    ("Protetor Solar Facial FPS 90 60g", "Óleo Mineral 20W50 Moto 4T api sl Lubrax 1 Litro", "DIFERENTE"),
    ("Protetor Solar Facial FPS 90 60g", "Bebedouro Industrial 100 litros 3 Torneiras Inox Ra10 Frisbel", "DIFERENTE"),
    ("Pillow Top Solteiro Espuma Hiper Soft", "Bebedouro Frisbel 100 Litros Coluna Inox", "DIFERENTE"),
    ("Bebedouro Industrial Frisbel 100 Litros", "Bebedouro Industrial Frisbel 100 Litros", "MATCH_SUGERIDO"),
    ("Tênis Adidas Duramo 2", "Tênis Adidas Duramo 2", "MATCH_SUGERIDO"),
]
for a,b,expected in cases:
    sa,sb = clean_text(a),clean_text(b)
    sc,motive,conflict = score_pair(sa,sb)
    status, faixa, reason = decide_pair(a,b,sc,motive,{}, {})
    assert status==expected,(a,b,status,reason)

# Conflicting category but identical EAN must stay under human review
sc,reason,_=score_pair(clean_text("Protetor Solar FPS 90"),clean_text("Óleo Lubrax 4T"))
status,*_=decide_pair("Protetor Solar FPS 90","Óleo Lubrax 4T",sc,reason,
                      {"Código de Barras":"7891234567890"},
                      {"Código de Barras Monitorado":"7891234567890"})
assert status=="REVISAR",status

tc=TestClient(app)
csv_data=("Descrição;Produto Monitorado;Código de Barras;Código de Barras Monitorado\n"
          "Protetor Solar FPS 90;Óleo Lubrax 4T;7891234567891;7891234567892\n"
          "Pillow Top Solteiro;Bebedouro Industrial 100 Litros;7891234567891;7891234567893\n"
          "Tênis Adidas Duramo;Tênis Adidas Duramo;7891234567891;7891234567891\n")
response=tc.post("/compare", files={
    "file_a":("data.csv",csv_data.encode()),
    "file_b":("data.csv",csv_data.encode()),
},data={"col_a":"Descrição","col_b":"Produto Monitorado","modo":"linha_a_linha"})
assert response.status_code==200,response.text
results=response.json()["resultados"]
assert [i["classificacao"] for i in results]==["DIFERENTE","DIFERENTE","MATCH_SUGERIDO"]
export=tc.post("/export",files={
    "file_a":("data.csv",csv_data.encode()),
    "resultados_json":("resultados.json",json.dumps(results,ensure_ascii=False).encode(),"application/json")
})
assert export.status_code==200,export.text
import openpyxl
wb=openpyxl.load_workbook(io.BytesIO(export.content),read_only=True)
assert sum(1 for _ in wb.active.values) == 4
print("OK: categorizacao, 1a1, EAN conflitante, exportacao Excel")

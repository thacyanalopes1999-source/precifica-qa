"""Testes independentes do cruzamento 1:1. Execute na raiz do Precifica QA."""
import csv
import io
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from fastapi.testclient import TestClient
from app.main import app
from app.services.crossing_v11 import repair_text


def payload(rows):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Descrição", "EAN"])
    writer.writerows(rows)
    return buf.getvalue().encode("utf-8")


def compare(a, b, modo="cruzamento_1a1"):
    res = TestClient(app).post("/compare", files={
        "file_a": ("base_a.csv", payload(a), "text/csv"),
        "file_b": ("base_b.csv", payload(b), "text/csv"),
    }, data={"col_a":"Descrição", "col_b":"Descrição", "modo":modo})
    assert res.status_code == 200, res.text[:800]
    return res.json()


class TestCrossing(unittest.TestCase):
    EAN = "7897230304779"
    def test_mojibake(self):
        self.assertEqual(repair_text("GenÃ©rico UniÃ£o QuÃ­mica"), "Genérico União Química")
        self.assertEqual(repair_text("Genérico União Química"), "Genérico União Química")

    def test_medicamento_mesma_dose(self):
        r=compare([("Piroxicam 20mg GenÃ©rico Neo QuÃ­mica 30 Comprimidos","")],
                  [("Piroxicam 20mg Genérico Neo Química 30 Comprimidos","")])
        self.assertEqual(r["resultados"][0]["classificacao"],"MATCH_SUGERIDO")
        self.assertEqual(r["resultados"][0]["score"],100.0)
        self.assertEqual(r["resultados"][0]["descricao_a"].split()[2],"GenÃ©rico")

    def test_dosagem_conflitante_mesmo_ean(self):
        r=compare([("Dipropionato Betametasona 5mg/g GenÃ©rico EMS 30g",self.EAN)],
                  [("Dipropionato Betametasona 0,5mg/g Generico EMS 30g",self.EAN)])
        self.assertEqual(r["resultados"][0]["classificacao"],"REVISAR")
        self.assertEqual(r["resultados"][0]["faixa"],"DOSAGEM_DIFERENTE")

    def test_combinacao_medicamento_dose_trocada(self):
        r=compare([("Maleato Enalapril 20mg + Hidroclorotiazida 12,5mg Genérico EMS 30 Comprimidos",self.EAN)],
                  [("Maleato Enalapril 12,5mg + Hidroclorotiazida 20mg Genérico EMS 30 Comprimidos",self.EAN)])
        self.assertEqual(r["resultados"][0]["classificacao"],"REVISAR")

    def test_medicamento_principio_ativo_diferente_mesmo_ean(self):
        r=compare([("Piroxicam 20mg Genérico EMS 30 comprimidos",self.EAN)],
                  [("Lisinopril 20mg Genérico EMS 30 comprimidos",self.EAN)])
        self.assertEqual(r["resultados"][0]["classificacao"],"REVISAR")

    def test_medicamento_quantidade(self):
        r=compare([("Piroxicam 20mg Genérico EMS 30 Comprimidos",self.EAN)],
                  [("Piroxicam 20mg Genérico EMS 60 Comprimidos",self.EAN)])
        self.assertEqual(r["resultados"][0]["classificacao"],"REVISAR")

    def test_normaliza_peso_decimal(self):
        r=compare([("Ração Biofresh 7,5kg","")],[("Ração Biofresh 7 5 Kg","")])
        self.assertEqual(r["resultados"][0]["classificacao"],"MATCH_SUGERIDO")

    def test_candidato_alternativo_melhor(self):
        a=[("Piroxicam 20mg Generico EMS 30 Comprimidos","")]
        b=[("Piroxicam 10mg Generico EMS 30 Comprimidos",""),
           ("Piroxicam 20mg Generico EMS 30 Comprimidos","")]
        r=compare(a,b)
        self.assertEqual(r["resultados"][0]["linha_b"],3)
        self.assertEqual(r["resultados"][0]["classificacao"],"MATCH_SUGERIDO")

    def test_exclusividade_um_para_um(self):
        a=[("Piroxicam 20mg Generico EMS 30 Comprimidos","")]*2
        b=[("Piroxicam 20mg Generico EMS 30 Comprimidos","")]
        r=compare(a,b)
        self.assertEqual(sum(x["classificacao"]=="MATCH_SUGERIDO" for x in r["resultados"]),1)
        self.assertEqual(sum(x["classificacao"]=="VINCULO_PENDENTE" for x in r["resultados"]),1)

    def test_linha_a_linha_permanece_independente(self):
        a=[("Piroxicam 20mg Generico EMS 30 Comprimidos","")]
        b=[("Piroxicam 10mg Generico EMS 30 Comprimidos","")]
        r=compare(a,b,modo="linha_a_linha")
        self.assertEqual(r["resultados"][0]["linha_b"],2)
        self.assertEqual(r["total_a"],1)

if __name__ == "__main__":
    unittest.main(verbosity=2)

"""Precifica QA — cruzamento 1:1 v11.1 (apenas o módulo de cruzamento).

Corrige falsos REVISAR de grafia/acentuação, mantendo revisão para doses,
formulações, EANs e fabricantes conflitantes. Não altera linha-a-linha.
"""
# V11.1: ajustes focados em revisão farmacêutica excessiva.
from __future__ import annotations
from collections import Counter, defaultdict
from functools import lru_cache
from decimal import Decimal, InvalidOperation
import math
import re
import unicodedata

MAX_CANDIDATES_V11 = 48
_COMMON = frozenset({
    "generico", "medicamento", "comprimido", "comprimidos", "capsulas", "capsula",
    "com", "de", "da", "do", "dos", "das", "para", "unidade", "unidades", "caixa",
    "mg", "ml", "g", "kg", "laboratorio", "original", "produto", "novo", "nova",
    "marca", "oferta", "disponivel", "branco", "branca", "uso", "oral", "c",
    "x", "cx", "revestido", "revestidos", "revestida", "revestidas", "gelatinosa",
    "gelatinosas", "dura", "duras", "dermatologico", "dermatologica", "oftalmica",
    "oftalmico", "frasco", "bisnaga", "1ml", "2ml", "3ml", "4ml", "5ml", "15ml",
    "20ml", "30ml", "50ml", "100ml", "sache", "saches", "ampola", "ampolas",
    "aplicadores", "aplicador", "farmaco", "labs", "lab", "prati", "donaduzzi",
    "solucao", "suspensao", "creme", "gel", "pomada", "gotas", "colirio", "xarope",
    "dragea", "drageas", "comps", "comp", "comprimdos", "po", "envelope", "envelopes",
    "cps", "qtd", "comprimido", "injetavel", "intramuscular", "injecao", "spray",
    "gotas", "bula", "farmacia", "farmacias", "nissei", "acido", "cido",
    "monoidratado", "monoidratada", "hidratada", "hidratado", "tri", "sesqui",
    "dihidratado", "dihidratada", "di", "anhidro", "anidra",
})
_LABS = {
 "ems", "medley", "neo", "quimica", "uniao", "ache", "eurofarma", "cimed",
 "germed", "sandoz", "teuto", "geolab", "biosintetica", "biolab", "prati",
 "donaduzzi", "legrand", "ranbaxy", "althaia", "merck", "novartis", "cimed",
 "glenmark", "pharlab", "vitamedic", "abbott", "cimed", "cimed", "mepha",
 "hypermarcas", "blau", "torrent", "catarinense", "ndS", "eurofarma",
 "novA", "belFAR", "ems", "germed", "neO", "sandoz",
}
_LABS = frozenset(x.lower() for x in _LABS)
_MEDICATION = re.compile(r"\b(?:generico|comprimidos?|capsulas?|ampolas?|pomada|injetavel|xarope|solucao|suspensao|colirio|drageas?|mg|mcg|ug|ui|dose|gliclazida|metformina)\b", re.I)
# Captura concentrações equivalentes (250mg/5ml = 50mg/ml) sem assumir que mg = mg/g.
_STRENGTH = re.compile(r"(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(mcg|ug|mg|ui|iu|%)\s*(?:/\s*(\d+(?:[.,]\d+)?)?\s*(ml|g|dose))?(?!\w)", re.I)
_PURE_GRAM_DOSE = re.compile(r"\b(\d+(?:[.,]\d+)?)\s*g\b", re.I)
_FORM_RULES = (
    ("comprimido", r"\bcomprimidos?\b|\bcomps?\b|\bcomprimdos\b"),
    ("capsula", r"\bcapsulas?\b"),
    ("ampola", r"\bampolas?\b"),
    ("pomada", r"\bpomada\b"),
    ("injetavel", r"\binjetavel\b|\bintramuscular\b"),
    ("solucao", r"\bsolucao\b"),
    ("suspensao", r"\bsuspensao\b"),
    ("colirio", r"\bcolirio\b"),
    ("xarope", r"\bxarope\b"),
    ("creme", r"\bcreme\b"),
    ("gel", r"\bgel\b"),
    ("gotas", r"\bgotas?\b"),
)
_COUNT = re.compile(r"\b(\d{1,4})\s*(comprimidos?|comps?|comprimdos|capsulas?|ampolas?|saches?|envelopes?|unidades?|drageas?)\b")
_PACKAGE = re.compile(r"\b(\d+(?:[.,]\d+)?)\s*(ml|g)\b")
_MOJIBAKE = re.compile(r"[ÃÂ][\x80-\xff\u201a\u201e\u2020\u2021\u2026\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]")
_ALIASES = {
    # Somente correções lexicais explícitas: nenhum fármaco é fundido por fuzzy matching.
    "dipropiona": "dipropionato", "hidroclorotiaziada": "hidroclorotiazida",
    "propanolol": "propranolol", "ciclobenzaprin": "ciclobenzaprina",
    "trimetropina": "trimetoprima", "trimetroprima": "trimetoprima",
    "bimatoprostra": "bimatoprosta", "giblenclamida": "glibenclamida",
    "cefadroxila": "cefadroxil", "cloridato": "cloridrato",
    "sodio": "sodico", "sodica": "sodico", "cloridratode": "cloridrato",
    "hidroclorotiaziada": "hidroclorotiazida", "risedrinato": "risedronato",
    "solifecacina": "solifenacina", "bisoprol": "bisoprolol",
}
_SALTS = frozenset({"cloridrato", "dicloridrato", "citrato", "sulfato", "acetato", "maleato", "fumarato", "hemifumarato", "bissulfato", "besilato", "tartarato", "hemifumarato", "succcinato", "succinato", "fosfato", "oxalato", "calcio", "calcico", "calcica", "sodico", "potassico", "potassio", "magnesico", "monopotassica", "sesquihidratado"})
_LAB_GROUPS = {
    "ache": "ache", "biosintetica": "ache", "prati": "prati", "donaduzzi": "prati",
    "neo quimica": "neoquimica", "neo": "neoquimica", "eurofarma": "eurofarma",
    "medley": "medley", "ems": "ems", "germed": "germed", "sandoz": "sandoz",
    "ranbaxy": "ranbaxy", "merck": "merck", "legrand": "legrand",
    "cimed": "cimed", "germed": "germed", "teuto": "teuto", "geolab": "geolab",
    "biolab": "biolab", "althaia": "althaia", "pharlab": "pharlab",
    "mepha": "mepha", "glenmark": "glenmark", "blau": "blau",
    "vitamedic": "vitamedic", "novartis": "novartis", "torrent": "torrent",
}


@lru_cache(maxsize=200_000)
def repair_text(raw: str) -> str:
    value = str(raw or "")
    if "Ã" not in value and "Â" not in value:
        return value
    for _ in range(3):
        def fix(match):
            for enc in ("cp1252", "latin1"):
                try:
                    return match.group().encode(enc).decode("utf-8")
                except (UnicodeError, ValueError):
                    pass
            return match.group()
        new = _MOJIBAKE.sub(fix, value)
        if new == value: break
        value = new
    return value


def _prepare(raw):
    t = repair_text(str(raw or ""))
    # Unir/tratar campo sem espaços: 'Omeprazol20mg56cápsulasCimedGenérico'.
    t = re.sub(r"(?<=[a-zà-ÿ])(?=[A-ZÀ-Ý])", " ", t)
    t = re.sub(r"(?<=[a-zA-ZÀ-ÿ])(?=\d)", " ", t)
    t = re.sub(r"(?<=\d)(?=[a-zA-ZÀ-ÿ])", " ", t)
    t = re.sub(r"(?i)\b(cloridrato|dicloridrato|dipropionato|mononitrato)(de|da|do)\b", r"\1 \2", t)
    # Padroniza repetição de descrição 'Produto - Produto', comum no catálogo.
    parts = re.split(r"\s+-\s+", t)
    if len(parts) == 2 and parts[0].casefold().strip() == parts[1].casefold().strip():
        t = parts[0]
    return t


def _normalize_decimal(raw: str) -> str:
    return re.sub(r"(?<!\d)(\d{1,2})\s+(\d)\s*(kg|l)(?!\w)", r"\1,\2 \3", raw, flags=re.I)


def canonical(raw: str, clean_text) -> str:
    return clean_text(_normalize_decimal(_prepare(raw)))


def _fold(raw: str) -> str:
    value = _prepare(raw)
    value = unicodedata.normalize("NFKD", value.casefold())
    return "".join(c for c in value if not unicodedata.combining(c)).replace("µ", "u").replace("μ", "u")


def _number(v):
    try:
        raw = str(v)
        # Separador de milhar brasileiro, especialmente em UI: 100.000UI = 100000UI.
        if re.fullmatch(r"\d{1,3}(?:\.\d{3})+", raw):
            raw = raw.replace(".", "")
        return Decimal(raw.replace(",", "."))
    except InvalidOperation:
        return Decimal(0)


def _strength_values(t):
    out=[]
    spans=[]
    for m in _STRENGTH.finditer(t):
        qty=_number(m.group(1))
        unit=m.group(2).lower()
        if unit in {"mcg", "ug"}:
            qty/=Decimal(1000)
            unit="mg"
        if unit == "iu":unit="ui"
        denom_qty=_number(m.group(3)) if m.group(3) else Decimal(1)
        denom=m.group(4) or ""
        if denom and denom_qty>0:qty/=denom_qty
        dose=(float(qty),unit,denom)
        out.append((m,dose));spans.append(m.span())
    return out,spans


def _med_features(raw: str):
    t=_fold(raw)
    if not _MEDICATION.search(t):
        return None
    doses,spans=_strength_values(t)
    # Cuidado: 1,5g em sachês é a dose, mas 30g em cremes é massa da embalagem.
    if not doses and re.search(r"\b(saches?|envelopes?)\b",t):
        gm=_PURE_GRAM_DOSE.search(t)
        if gm:
            dose=(float(_number(gm.group(1))*Decimal(1000)), "mg", "")
            doses=[(gm,dose)];spans=[gm.span()]
    groups=[]
    prev=0
    for m,dose in doses:
        chunk=re.sub(r"[^\w\s]", " ",t[prev:m.start()])
        # Repetições 'Pantoprazol ... - Pantoprazol ...': considera somente assinatura, não duas doses.
        toks=[_ALIASES.get(x,x) for x in chunk.split()]
        core=frozenset(x for x in toks if x not in _COMMON and x not in _LABS and x not in _SALTS and not x.isnumeric() and not re.fullmatch(r"\d+(?:[.,]\d+)?",x))
        salts=frozenset(x for x in toks if x in _SALTS)
        # medicamentos com princípio e dois componentes: vincular dose ao princípio respectivo
        if core:
            groups.append((core, dose, salts))
        prev=m.end()
    if not groups and doses:
        text_before=t[:doses[0][0].start()]
        toks=[_ALIASES.get(x,x) for x in re.findall(r"\w+",text_before)]
        core=frozenset(x for x in toks if x not in _COMMON and x not in _LABS and x not in _SALTS and not x.isnumeric())
        if core:groups.append((core,doses[0][1],frozenset(x for x in toks if x in _SALTS)))
    ingredients=frozenset(x for core,_,_ in groups for x in core)
    salts=frozenset(x for _,_,s in groups for x in s)
    strength=tuple(sorted({dose for _,dose in doses}))
    comp=tuple(sorted({(tuple(sorted(core)),dose) for core,dose,_ in groups}))
    forms=frozenset(name for name,pat in _FORM_RULES if re.search(pat,t))
    counts=frozenset(int(n) for n,_ in _COUNT.findall(t))
    # Apresentação exclui concentrações mg/ml e mg/g e evita confundir 5ml da dose com volume da embalagem.
    package_text=t
    for start,end in reversed(spans):package_text=package_text[:start]+" "+package_text[end:]
    packages=frozenset((float(_number(n)),unit) for n,unit in _PACKAGE.findall(package_text))
    # Fabricante com identificação explícita; marca diferente não é o mesmo SKU.
    labs=set()
    lab_tokens=t.split()
    for k,x in enumerate(lab_tokens):
        if x in _LAB_GROUPS:
            labs.add(_LAB_GROUPS[x])
    if "neo" in labs and "quimica" in lab_tokens:labs.discard("neo");labs.add("neoquimica")
    if "neoquimica" in labs and "quimica" in lab_tokens:pass
    if "ache" in labs and "biosintetica" in lab_tokens: labs={x for x in labs if x=="ache" or x not in {"biosintetica"}}
    return {"ingredient":ingredients,"components":comp,"strength":strength,
            "salts":salts, "form":forms,"count":counts,"package":packages,
            "lab":frozenset(labs),"text":t}


def _form_relation(a,b):
    # Apresentação específica 'solução oral', 'gotas' exige cautela; não equivaler cápsula a comprimido.
    if a == b:return "igual"
    if a & {"comprimido","capsula","pomada","creme","gel","xarope","suspensao","ampola","injetavel","colirio"} and b & {"comprimido","capsula","pomada","creme","gel","xarope","suspensao","ampola","injetavel","colirio"}:
        if a != b:return "diferente"
    if a and b and a != b:
        return "incerto"
    return "ausente"


def _drug_decision(raw_a, raw_b, score, ean, status, faixa, reason):
    a,b=_med_features(raw_a),_med_features(raw_b)
    if not a and not b:return status,faixa,reason
    if not a or not b:
        if score >=45 or ean=="IGUAL":
            return "REVISAR","MEDICAMENTO_SEM_DADOS","Informação farmacêutica insuficiente para confirmação; "+reason
        return "SEM_CANDIDATO","SEM_CONFIRMACAO","Medicamento não identificado com segurança nas duas descrições"
    ai,bi=a["ingredient"],b["ingredient"]
    if not ai or not bi:
        return "REVISAR","PRINCIPIO_ATIVO_A_CONFIRMAR","Princípio ativo não extraído com segurança"
    if ai != bi:
        if ean=="IGUAL":return "REVISAR","CONFLITO_EAN_MEDICAMENTO","EAN coincidente, mas princípios ativos descritos não coincidem"
        if not ai & bi:return "DIFERENTE","PRINCIPIO_ATIVO_DIFERENTE","Princípios ativos incompatíveis"
        return "REVISAR","COMPOSICAO_A_CONFIRMAR","Composição farmacêutica parcialmente divergente"
    if a["strength"] != b["strength"]:
        if not a["strength"] or not b["strength"]:
            return "REVISAR","DOSAGEM_NAO_CONFIRMADA","Dosagem ou concentração não identificada em uma descrição"
        return "REVISAR","DOSAGEM_DIFERENTE","Concentração/dose diferente ou unidade não comprovadamente equivalente"
    if not a["strength"]:
        return "REVISAR","DOSAGEM_NAO_CONFIRMADA","Dosagem não identificada em ambas as descrições"
    if a["components"] and b["components"] and a["components"] != b["components"]:
        return "REVISAR","ASSOCIACAO_PRINCIPIO_DOSAGEM","Vinculação de dose a princípio ativo não coincide"
    # Sal declarado de ambos os lados e diferente pode indicar especialidade distinta.
    if a["salts"] and b["salts"] and a["salts"] != b["salts"]:
        return "REVISAR","SAL_FARMACEUTICO_DIFERENTE","Sal/forma química declarada diferente"
    form_rel=_form_relation(a["form"],b["form"])
    if form_rel in {"diferente","incerto"}:
        return "REVISAR","FORMA_FARMACEUTICA","Forma farmacêutica ou via de administração não coincide"
    if a["count"] and b["count"] and a["count"]!=b["count"]:
        return "REVISAR","QUANTIDADE_EMBALAGEM","Quantidade de unidades da embalagem diferente"
    if a["package"] and b["package"] and a["package"]!=b["package"]:
        return "REVISAR","EMBALAGEM_DIFERENTE","Volume/massa comercial diferente"
    # Exigir consistência de fabricante quando explicitado em ambos os anúncios.
    if a["lab"] and b["lab"] and not a["lab"] & b["lab"]:
        return "REVISAR","FABRICANTE_DIVERGENTE","Fabricantes declarados diferentes: conferir SKU/registro"
    # Diferença real de GTIN/EAN não pode virar MATCH simplesmente por título semelhante.
    if ean=="DIFERENTE":
        return "REVISAR","EAN_DIVERGENTE","Descrição e dose compatíveis, mas EANs/GTINs divergentes"
    # Forma/contagem omitida: permite match só quando outro campo identifica fortemente SKU.
    incomplete=bool((a["form"] and not b["form"]) or (b["form"] and not a["form"]) or
                    (a["count"] and not b["count"]) or (b["count"] and not a["count"]) or
                    (a["package"] and not b["package"]) or (b["package"] and not a["package"]))
    same_lab=bool(a["lab"] and b["lab"] and a["lab"] & b["lab"])
    if incomplete and not (ean=="IGUAL" and same_lab and score>=78):
        return "REVISAR","APRESENTACAO_INCOMPLETA","Parte da apresentação não foi descrita; verificar antes de vincular"
    # Evidências estruturais fortes permitem superar grafias, sais omitidos e títulos curtos.
    if ean=="IGUAL" or (score>=89 and same_lab and ((bool(a["count"]) and a["count"]==b["count"]) or (bool(a["package"]) and a["package"]==b["package"]))):
        return "MATCH_SUGERIDO","MEDICAMENTO_COMPATIVEL","Princípio ativo, dose e apresentação compatíveis; sem conflito comercial detectado"
    if score>=95 and not a["salts"]^b["salts"]:
        return "MATCH_SUGERIDO","MEDICAMENTO_COMPATIVEL","Composição e apresentação compatíveis com alta semelhança textual"
    return "REVISAR","IDENTIDADE_MEDICAMENTO_PARCIAL","Medicamento semelhante, mas identidade comercial ainda não comprovada"

def _salient(norm):
    return {x for x in norm.split() if len(x) >= 3 and x not in _COMMON}


def _classify(raw_a, raw_b, na, nb, row_a, row_b, score_pair, decide_pair, ean_state):
    score, reason, _ = score_pair(na, nb)
    state = ean_state(row_a, row_b)
    st, faixa, detail = decide_pair(_normalize_decimal(repair_text(raw_a)),
                                    _normalize_decimal(repair_text(raw_b)),
                                    score, reason, row_a, row_b)
    st, faixa, detail = _drug_decision(raw_a, raw_b, score, state, st, faixa, detail)
    if st == "MATCH_SUGERIDO" and (score < 70 and state != "IGUAL"):
        st, faixa, detail = "REVISAR", "IDENTIDADE_FRACA", "Score abaixo de 70 sem EAN confirmado; " + detail
    if st == "DIFERENTE" and faixa == "SEM_IDENTIDADE_COMERCIAL":
        if score >= 48:
            st, faixa, detail = "REVISAR", "SEMELHANCA_SEM_IDENTIDADE", "Semelhança parcial: identidade não comprovada; " + detail
        else:
            st, faixa, detail = "SEM_CANDIDATO", "SEM_EVIDENCIA", "Não foi encontrado candidato comercialmente plausível"
    return score, st, faixa, detail, state


def cross_1a1(a, b, descriptions_a, descriptions_b, clean_text, split_description,
              score_pair, decide_pair, ean_value, ean_state):
    """Retorna o contrato antigo da API. Apenas o modo cruzamento_1a1 usa este método."""
    na = [canonical(split_description(x)[0], clean_text) for x in descriptions_a]
    nb = [canonical(split_description(x)[0], clean_text) for x in descriptions_b]
    n_a, n_b = len(na), len(nb)
    indexed = defaultdict(list)
    for j, txt in enumerate(nb):
        for token in _salient(txt):
            indexed[token].append(j)
    ean_cols_a = ("Código de Barras", "Codigo de Barras", "EAN", "GTIN")
    ean_cols_b = ("Código de Barras Monitorado", "Codigo de Barras Monitorado", "EAN", "GTIN")
    rows_a = [a.iloc[i] for i in range(n_a)]
    rows_b = [b.iloc[j] for j in range(n_b)]
    eans_b = defaultdict(list)
    for j, row in enumerate(rows_b):
        v = ean_value(row, ean_cols_b)
        if v:
            eans_b[v].append(j)
    freq = {term:len(indices) for term, indices in indexed.items()}
    # score de raridade/IDF sem criar matriz cartesiana AxB.
    edges = []
    by_a = defaultdict(list)
    proposals = defaultdict(list)
    for i, txt in enumerate(na):
        if not txt:
            continue
        ranks = Counter()
        terms = _salient(txt)
        for term in terms:
            entries = indexed.get(term, [])
            if not entries or len(entries)>max(500, n_b//4):
                continue
            w = 1.0 + math.log((n_b+1)/(len(entries)+1))
            for j in entries:
                ranks[j] += w
        selected = [j for j,_ in ranks.most_common(MAX_CANDIDATES_V11)]
        ea = ean_value(rows_a[i], ean_cols_a)
        if ea:
            # EAN validado aumenta a cobertura, mas nunca prova identidade sozinho.
            by_ean = eans_b.get(ea, [])
            # Se muitos anúncios têm EAN repetido, escolha os mais semelhantes.
            if len(by_ean)>16:
                from rapidfuzz import fuzz
                by_ean = sorted(by_ean, key=lambda j: -fuzz.token_set_ratio(txt, nb[j]))[:16]
            selected = list(dict.fromkeys(list(by_ean)+selected))[:MAX_CANDIDATES_V11]
        for j in selected:
            if not nb[j]:
                continue
            score, st, faixa, reason, state = _classify(
                descriptions_a[i], descriptions_b[j], txt, nb[j], rows_a[i], rows_b[j],
                score_pair, decide_pair, ean_state)
            # Score é apenas de texto. Classificação de segurança manda na ordenação.
            priority = (3 if st == "MATCH_SUGERIDO" else
                        2 if st == "REVISAR" else
                        1 if st == "DIFERENTE" else 0)
            q = score + (4 if state == "IGUAL" and st == "MATCH_SUGERIDO" else 0)
            entry = (priority, q, i, j, score, st, faixa, reason)
            proposals[i].append(entry)
            if st == "MATCH_SUGERIDO":
                edges.append(entry)
                by_a[i].append(entry)
    edges.sort(key=lambda x:(-x[1], x[2], x[3]))
    for i in by_a:
        by_a[i].sort(key=lambda x:(-x[1],x[3]))
    assigned, occupied = {}, {}
    for e in edges:
        _, _, i, j, *_ = e
        if i not in assigned and j not in occupied:
            assigned[i]=e
            occupied[j]=i
    # Melhorar cardinalidade: realocação curta sem violar exclusividade.
    for i in range(n_a):
        if i in assigned:
            continue
        for e in by_a.get(i, []):
            j=e[3]
            if j not in occupied:
                assigned[i]=e; occupied[j]=i
                break
            incumbent=occupied[j]
            alt=next((p for p in by_a[incumbent] if p[3] not in occupied),None)
            if alt is not None:
                assigned[incumbent]=alt
                occupied[alt[3]]=incumbent
                assigned[i]=e
                occupied[j]=i
                break
    results=[]
    for i, raw in enumerate(descriptions_a):
        if i in assigned:
            _,_,_,j,score,st,faixa,reason=assigned[i]
            results.append({"linha_a":i+2,"descricao_a":raw,"linha_b":j+2,
                            "descricao_b":descriptions_b[j],"score":score,
                            "classificacao":st,"faixa":faixa,"motivo":reason,
                            "revisao":"PENDENTE"})
            continue
        possible=proposals.get(i,[])
        if not possible:
            results.append({"linha_a":i+2,"descricao_a":raw,"linha_b":None,
                            "descricao_b":"","score":None,"classificacao":"SEM_CANDIDATO",
                            "faixa":"SEM_CANDIDATO", "motivo":"Busca ampliada não encontrou candidato; ausência não comprovada",
                            "revisao":"PENDENTE"})
            continue
        # Prefere revisar candidato plausível a concluir DIFERENTE por texto.
        possible.sort(key=lambda x:(-x[0],-x[1],x[3]))
        _,_,_,j,score,st,faixa,reason=possible[0]
        if st == "MATCH_SUGERIDO":
            st,faixa="VINCULO_PENDENTE","VINCULO_OCUPADO"
            reason="Par compatível já utilizado em vínculo 1:1; "+reason
        else:
            reason="Sugestão de referência, sem vínculo reservado; "+reason
        results.append({"linha_a":i+2,"descricao_a":raw,"linha_b":None,
                        "descricao_b":descriptions_b[j],"score":score,
                        "classificacao":st,"faixa":faixa,"motivo":reason,"revisao":"PENDENTE"})
    linked=[r["linha_b"] for r in results if r["linha_b"] is not None]
    assert len(linked)==len(set(linked)), "Base B duplicada em cruzamento 1:1"
    return {"total_a":n_a,"total_b":n_b,
            "totais":dict(Counter(r["classificacao"] for r in results)),
            "resultados":results,"avisos":[
                "Motor de cruzamento 1:1 v11: normalização de acentos/textos corrompidos, busca por EAN validado e tokens raros.",
                "Medicamentos: dose, princípio ativo, forma e embalagem são analisados antes de permitir MATCH.",
                "Dose diferente exige REVISAR; sem vínculo não significa produto ausente.",
                "Nenhuma exclusão, confirmação clínica ou aprovação é automática.",
                "Busca heurística limitada a 48 candidatos por linha; grandes bases exigem fila e validação de desempenho."]}

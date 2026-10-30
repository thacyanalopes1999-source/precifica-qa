from app.main import clean_text, score_pair

def test_order_independent():
    a = clean_text('Vaso sanitário 80 x 120')
    b = clean_text('sanitário vaso 80x120')
    score, _, conflict = score_pair(a, b)
    assert score == 100 and not conflict

def test_color_conflict():
    score, reason, conflict = score_pair(clean_text('Vaso sanitário branco'), clean_text('Vaso sanitário preto'))
    assert conflict and 'Cor divergente' in reason and score <= 89

def test_missing_measurement_requires_review():
    _, _, conflict = score_pair(clean_text('Vaso sanitário 40x129'), clean_text('Sanitário vaso'))
    assert conflict

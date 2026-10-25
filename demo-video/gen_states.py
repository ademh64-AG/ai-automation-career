# Gen states: builds progressive HTML states for each scene (typing/stepwise reveal).
# Usage: python gen_states.py
import os
from pathlib import Path

BASE = Path(r"C:\Users\Administrator\ai-automation-career\demo-video")
SCENES = BASE / "scenes-v2"
STATES = BASE / "states"
STATES.mkdir(exist_ok=True)
SCENES.mkdir(exist_ok=True)

W, H = 1920, 1080

def wrap(body_css, body_html):
    return f"""<!doctype html><html lang="ru"><meta charset="utf-8"><head><style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ width:{W}px; height:{H}px; font-family:'Segoe UI',sans-serif; overflow:hidden; }}
{body_css}
</style></head><body>
{body_html}
</body></html>"""

# ---------- 01 INRO ----------
intro_css = """
body { background:linear-gradient(135deg,#0b1220,#16223a); color:#e2e8f0; display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative; }
.logo { font-size:28px; letter-spacing:6px; color:#38bdf8; font-weight:300; }
h1 { font-size:82px; font-weight:800; color:#f1f5f9; text-align:center; line-height:1.2; }
h2 { font-size:36px; color:#94a3b8; font-weight:400; }
.badge { padding:14px 36px; border:2px solid #38bdf8; border-radius:999px; color:#38bdf8; font-size:22px; }
.deco { position:absolute; border-radius:50%; filter:blur(60px); opacity:.35; }
.d1 { width:520px; height:520px; background:#1d4ed8; top:-160px; left:-160px; }
.d2 { width:420px; height:420px; background:#0e7490; bottom:-140px; right:-120px; }
"""
def intro(step):
    parts = []
    if step >= 1: parts.append('<div class="deco d1"></div><div class="deco d2"></div>')
    if step >= 2: parts.append('<div class="logo">AI AUTOMATION</div>')
    if step >= 3: parts.append('<h1>Демонстрация пакета автоматизации</h1>')
    if step >= 4: parts.append('<h2>10 рабочих модулей · Демченко А.Г.</h2>')
    if step >= 5: parts.append('<div class="badge">Заявки → CRM · AI Request Agent · ЗооПульт</div>')
    return wrap(intro_css, "\n".join(parts))

# ---------- 02 FORM ----------
form_css = """
body { background:#f8fafc; color:#0f172a; display:flex; align-items:center; justify-content:center; }
.card { background:#fff; border:1px solid #e2e8f0; border-radius:20px; padding:56px 64px; width:1060px; box-shadow:0 14px 40px rgba(0,0,0,.1); transition: transform .3s; }
.card h2 { font-size:36px; margin-bottom:32px; }
.field { margin-bottom:20px; }
.field label { display:block; font-size:16px; color:#475569; margin-bottom:6px; font-weight:600; }
.field input, .field textarea { width:100%; padding:15px 16px; border:1px solid #cbd5e1; border-radius:10px; font-size:20px; font-family:inherit; }
.btn { margin-top:12px; background:#1a7f37; color:#fff; border:none; padding:17px 38px; border-radius:10px; font-size:22px; font-weight:600; display:inline-block; }
.cursor { display:inline-block; width:3px; height:1.2em; background:#38bdf8; vertical-align:middle; margin-left:2px; animation: blink 1s step-end infinite; }
@keyframes blink { 50% { opacity:0; } }
"""
def form(step):
    # step: 0 empty, 1 name typed, 2 phone, 3 store+city, 4 message+button
    fields = []
    name_val = "Иван Петренко" if step >= 1 else ""
    phone_val = "+380 68 123 45 67" if step >= 2 else ""
    store_val = "Зоомагазин «Лапа»" if step >= 3 else ""
    city_val = "Кривой Рог" if step >= 3 else ""
    msg_val = "Хотим заказать корма оптом для больших собак, 50 мешков в месяц. Просим прайс и график доставки." if step >= 4 else ""
    cur = '<span class="cursor"></span>' if step < 4 else ""
    fields.append(f'<div class="field"><label>Ваше имя</label><input value="{name_val}">{cur if step==1 else ""}</div>')
    fields.append(f'<div class="field"><label>Телефон</label><input value="{phone_val}">{cur if step==2 else ""}</div>')
    fields.append(f'<div class="field"><label>Название магазина</label><input value="{store_val}">{cur if step==3 else ""}</div>')
    fields.append(f'<div class="field"><label>Город</label><input value="{city_val}"></div>')
    fields.append(f'<div class="field"><label>Сообщение</label><textarea rows="3">{msg_val}</textarea>{cur if step==4 else ""}</div>')
    btn = '<div class="btn">Отправить</div>' if step >= 4 else ""
    return wrap(form_css, f'<div class="card"><h2>Заявка на сотрудничество</h2>{"".join(fields)}{btn}</div>')

# ---------- 03 ENRICH ----------
enrich_css = """
body { background:#0a0f1e; color:#a5f3fc; padding:80px 96px; font-family:'Consolas','Courier New',monospace; }
h1 { color:#38bdf8; font-size:32px; }
.sub { color:#64748b; font-size:18px; margin-bottom:40px; }
.line { font-size:26px; line-height:1.75; }
.c { color:#e2e8f0; } .g { color:#4ade80; } .y { color:#facc15; }
.cursor { display:inline-block; width:14px; height:28px; background:#38bdf8; vertical-align:middle; animation: blink 0.8s step-end infinite; }
@keyframes blink { 50% { opacity:0; } }
"""
def enrich(step):
    lines = []
    if step >= 1: lines.append('<div class="line"><span class="g">✓</span> Принята заявка <span class="c">LEAD-1792833736193</span></div>')
    if step >= 2: lines.append('<div class="line"><span class="g">✓</span> LLM-вызов… 0.8с</div>')
    if step >= 3: lines.append('<div class="line"><span class="y">intent</span>: <span class="c">"buy"</span></div>')
    if step >= 4: lines.append('<div class="line"><span class="y">priority</span>: <span class="c">"high"</span></div>')
    if step >= 5: lines.append('<div class="line"><span class="y">summary</span>: <span class="c">"Оптовый покупатель хочет заказать корма, просит прайс и доставку"</span></div>')
    if step >= 6: lines.append('<div class="line"><span class="y">draft</span>: <span class="c">"Добрый день! Благодарим за заявку. Направляем прайс…"</span></div>')
    if step >= 7: lines.append('<div class="line"><span class="g">✓</span> Telegram: сообщение менеджеру отправлено</div>')
    cur = '<span class="cursor"></span>' if step < 7 else ""
    return wrap(enrich_css, f'<h1>enrich-server.js — LLM-обогащение заявки</h1><div class="sub">POST /enrich → Groq qwen/qwen3.8-27b</div>{"".join(lines)}{cur}')

# ---------- 04 TELEGRAM ----------
tg_css = """
body { background:#0b1220; color:#e2e8f0; padding:80px 96px; }
h1 { font-size:34px; color:#4ade80; margin-bottom:40px; }
.msg { background:#16223a; border-radius:16px; padding:28px 32px; margin-bottom:20px; max-width:1100px; transition: opacity .4s; }
.from { font-size:16px; color:#94a3b8; margin-bottom:10px; }
.title { font-size:24px; font-weight:600; color:#f1f5f9; margin-bottom:12px; }
.body { font-size:21px; color:#cbd5e1; line-height:1.6; }
.tag { display:inline-block; margin-top:14px; padding:6px 18px; border-radius:999px; font-size:16px; font-weight:600; }
.high { background:#7f1d1d; color:#fecaca; }
"""
def telegram(step):
    parts = ['<h1>Telegram — менеджеру</h1>']
    if step >= 1:
        parts.append('''<div class="msg">
  <div class="from">🤖 бот @incoming_request_agent_bot</div>
  <div class="title">🆕 Новая заявка LEAD-…193</div>
  <div class="body">👤 Иван Петренко (+380 68 123 45 67)<br>🏪 Зоомагазин «Лапа» / Кривой Рог<br>📝 Хотим заказать корма оптом…</div>
</div>''')
    if step >= 2:
        parts.append('''<div class="msg">
  <div class="from">🤖 бот</div>
  <div class="title">📄 Черновик ответа</div>
  <div class="body">«Добрый день! Благодарим за заявку. Направляем прайс и график доставки. Готовы ответить на вопросы.»</div>
</div>''')
    if step >= 3:
        parts.append('<div class="msg"><span class="tag high">HIGH PRIORITY</span></div>')
    return wrap(tg_css, "\n".join(parts))

# ---------- 05 MODULES ----------
mod_css = """
body { background:#0b1220; color:#e2e8f0; padding:70px 80px; }
h1 { font-size:36px; margin-bottom:40px; color:#f1f5f9; }
.grid { display:grid; grid-template-columns:1fr 1fr 1fr 1fr 1fr; gap:16px; }
.m { background:#16223a; border-radius:14px; padding:22px 18px; min-height:200px; opacity:0; animation: fadeIn .45s forwards; }
@keyframes fadeIn { to { opacity:1; } }
.n { font-size:16px; color:#38bdf8; font-weight:700; margin-bottom:12px; }
.t { font-size:19px; font-weight:600; color:#f1f5f9; margin-bottom:8px; }
.d { font-size:14px; color:#94a3b8; line-height:1.5; }
"""
MODULES = [
    ("01","Генератор отчетов","CSV → LLM → HTML/MD → Telegram"),
    ("02","Счета PDF","Распознавание → invoices.csv"),
    ("03","Радар цен","Конкуренты, дельты, тренды"),
    ("04","RAG-чат-бот","Векторный поиск + LLM"),
    ("05","Скоринг резюме","Оценка 1–10, вердикты"),
    ("06","Дедлайны","Контроль + Telegram-напоминания"),
    ("07","Приоритизация почты","LLM классифицирует письма"),
    ("08","Очистка данных","Телефоны, адреса, дубли"),
    ("09","Контент-посты","Автопубликация в Telegram"),
    ("10","Заявки → CRM","Форма → сервер → LLM → менеджер"),
]
def modules(step):
    cards = []
    for i, (n, t, d) in enumerate(MODULES):
        if i < step:
            delay = (i % 5) * 0.06
            cards.append(f'<div class="m" style="animation-delay:{delay}s"><div class="n">{n}</div><div class="t">{t}</div><div class="d">{d}</div></div>')
    return wrap(mod_css, f'<h1>Пакет: 10 рабочих модулей</h1><div class="grid">{"".join(cards)}</div>')

# ---------- 06 FINAL ----------
final_css = """
body { background:linear-gradient(135deg,#0b1220,#16223a); color:#e2e8f0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
h1 { font-size:70px; font-weight:800; color:#f1f5f9; }
.url { font-size:34px; color:#38bdf8; margin-top:24px; }
.done { font-size:24px; color:#4ade80; margin-top:48px; }
.contact { font-size:24px; color:#94a3b8; margin-top:14px; }
"""
def final(step):
    parts = []
    if step >= 1: parts.append('<h1>Спасибо за внимание!</h1>')
    if step >= 2: parts.append('<div class="url">github.com/ademh64-AG/ai-automation-career</div>')
    if step >= 3: parts.append('<div class="done">✓ Код открыт · 10 модулей · демо-данные</div>')
    if step >= 4: parts.append('<div class="contact">Александр Демченко · +38 068 480 53 08 · @alex_d64</div>')
    return wrap(final_css, "\n".join(parts))

# states per scene: (name, count)
PLAN = [
    ("01-intro", 5, intro),
    ("02-form", 5, form),
    ("03-enrich", 7, enrich),
    ("04-telegram", 3, telegram),
    ("05-modules", 10, modules),
    ("06-final", 4, final),
]

for name, count, fn in PLAN:
    for s in range(1, count + 1):
        html = fn(s)
        p = STATES / f"{name}-s{s:02d}.html"
        p.write_text(html, encoding="utf-8")
    print(name, count)
print("OK")

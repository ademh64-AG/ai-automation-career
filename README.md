# AI Automation — Портфоліо Демченко О.Г.

> Повний пакет: 10 модулів автоматизації + AI Request Agent + продукт
> «ЗооПульт». Усе — робочі проєкти з кодом, демо-даними, запуском
> і Telegram-інтеграцією.

> **Секрети:** у `shared-secrets/.env` (у репозиторії відсутній).
> Вставте власні ключі Groq/Gemini перед запуском.

---

## Коротко про кандидата
- 35 років у промисловості (майстер цеху, інженер з надійності, директор).
- Останні 5 місяців — щоденна робота з ІІ-агентами (OpenCode, Cline, Hermes).
- Самостійно реалізував 10+ робочих модулів автоматизації (один стек:
  Node.js + LLM (Groq/Gemini) + Telegram + CSV + n8n).
- Цільова роль: Спеціаліст з автоматизації процесів (AI Automation), Junior/Middle.

---

## 🗂 10 модулів автоматизації

| # | Модуль | Суть | Папка |
|---|---|---|---|
| 1 | Генератор звітів | CSV → агрегація → LLM-резюме → HTML/MD → Telegram | `project1-reports/` |
| 2 | PDF/рахунки | PDF → текст → LLM → структурований JSON → invoices.csv → Telegram | `project2-pdf/` |
| 3 | Радар цін | Прайси конкурентів/точок → дельти, тренди, ризики → рекомендації LLM | `project3-prices/` |
| 4 | Чат-бот RAG | Векторний пошук (embeddings) + LLM по своїй базі знань | `project4-rag/` |
| 5 | Скоринг резюме | LLM оцінює кандидатів: бал 1–10, вердикт, сильні/слабкі | `project5-scoring/` |
| 6 | Контроль дедлайнів | Таблиця задач/рахунків → прострочені → Telegram-нагадування | `project6-deadlines/` |
| 7 | Приоритизація пошти | LLM класифікує листи (customer/invoice/spam/claim…) → high → Telegram | `project7-mailbox/` |
| 8 | Очистка даних | Нормалізація телефонів (правила) + адрес (LLM) + дедублікація | `project8-dataclean/` |
| 9 | Автопублікація | Сирі джерела → LLM-пост → Telegram (з контролем дублів) | `project9-content/` |
| 10 | Заявки → CRM | Форма сайту → вебхук → LLM → leads.csv → Telegram → чернетка відповіді | `project10-web2crm/` |

### Додатково
- **AI Request Agent** — обробка вхідних заявок (n8n + Gemini, human-in-the-loop, точність 50%/40%/73% на 30 тестах).
- **Продукт «ЗооПульт»** — SaaS для зоомагазинів (лів. демо: zoo-pult2.pages.dev).

---

## 📦 Єдиний стек (перевикористовується)
- Node.js (скрипти, HTTP-сервіси)
- LLM API: Groq (`qwen/qwen3.8-27b`, `openai/gpt-oss-20b`), Gemini (`gemini-3.5-flash`, embeddings)
- Telegram Bot API (`@incoming_request_agent_bot`)
- CSV/NDJSON, JSON
- n8n (schedule/webhook workflow)
- Рішення з безпеки: секрети в `shared-secrets/.env` (gitignored); чисті шаблони без ключів

---

## 🧭 Як це демонструє навички
| Навичка | Де видно |
|---|---|
| Промпт-інженерія | project2/4/5/7/10 (жорсткі JSON-схеми) |
| Робота з LLM API + embeddings | project4 (векторний пошук), project1/2/3/5/7/10 |
| REST API, вебхуки, JSON | project10, project6 (HTTP-сервіси) |
| Детермінована логіка + правила | project6 (дати), project8 (телефони), project7 (маршрутизація) |
| Human-in-the-loop | AI Request Agent, project10 (чернетка вирішує людина) |
| Обробка помилок/ретраї | скрізь (429/404/парсинг) |
| Мислення «бізнес-процесу» | усі модулі вирішують реальні задачі дистриб’ютора/зоомагазину |

---

## 🚀 Як запустити (приклад)
```
# секрети (один раз)
# (у файлі shared-secrets/.env: GROQ_API_KEY=..., GEMINI_API_KEY=...)

# 1. Звіт
node project1-reports/report-generator.js --send

# 2. PDF-рахунок
node project2-pdf/pdf-extractor.js project2-pdf/demo-invoice.pdf --send

# 3. Радар цін
node project3-prices/price-radar.js --send

# 4. RAG-чат-бот
node project4-rag/rag-bot.js "Які умови доставки?" --telegram

# 5. Скоринг резюме
node project5-scoring/resume-scorer.js --send

# 6. Дедлайни
node project6-deadlines/deadline-checker.js --send

# 7. Пошта
node project7-mailbox/inbox-prioritizer.js --send

# 8. Очистка даних
node project8-dataclean/data-cleaner.js --send

# 9. Контент
node project9-content/content-autopublisher.js --publish

# 10. Заявки → CRM (два сервіси + форма)
node project10-web2crm/lead-server.js
node project10-web2crm/enrich-server.js
```

---

## 📁 Структура репозиторію
```
ai-automation-career/
  ROADMAP-10-projects.md
  shared-secrets/          # .env (секрети), env.js
  project1-reports/ … project10-web2crm/
  (що в кожному: README.md, код, демо-дані, звіти)
```

---

## ⚠️ Чесні обмеження
- Усі проєкти — демонстраційні, із синтетичними даними; без комерційного впровадження.
- Безкоштовні ліміти LLM можуть змінюватися; де потрібно — використано обхід (Groq).
- Векторний пошук у пам’яті (для масштабу — векторна БД).
- Це навчальні проекти, а не SaaS-продукти; герой «ЗооПульт» — окремий власний продукт.

# Проект 10: Заявки з сайту → CRM-процес

> Повний цикл: форма на сайті → приймання → LLM-збагачення →
> Telegram менеджеру → чернетка відповіді клієнту.

## Як працює
```
[Форма на сайті (lead-form.html)]
        │ POST /lead
        ▼
[lead-server.js: 127.0.0.1:8793]  → запис у leads.csv
        │
        ▼
[enrich-server.js: 127.0.0.1:8794] → LLM: intent/priority/summary/draft
        │
        ▼
[Telegram: менеджеру]  (нова заявка + чернетка відповіді)
```

## Запуск
```
node lead-server.js      # прийом заявок (порт 8793)
node enrich-server.js    # збагачення + Telegram (порт 8794)
```
Гібрид з n8n: `workflow_lead_webhook.json` (Webhook → enrich → Telegram → відповідь клієнту).

## Перевірено (24.10.2026)
- Форма (lead-form.html) → POST /lead → `leads.csv` (запис `LEAD-...`);
- /enrich → `{"intent":"buy","priority":"high","summary":"...","draft":"..."}` → Telegram (telegram_ok: true).
- Приклад заявки: «Хочемо замовити корми оптом...» → intent=buy, priority=high.

## Демо
Відкрийте `lead-form.html` у браузері, заповніть і надішліть — заявка пройде весь шлях.

## Ключова цінність
- **Вебхук + два локальні сервіси + n8n** — композиція простих компонентів у повний конвеєр.
- **Human-in-the-loop**: менеджер отримує готову чернетку, але рішення — за ним.
- Повністю повторює real-world сценарій інтернет-магазину / дистриб’ютора.

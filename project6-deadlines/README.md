# Проект 6: Контроль дедлайнів та інвойсів (Telegram-нагадування)

> Пункт №6 зі списку варіантів. Автоматизація контролю дедлайнів:
> таблиця задач/рахунків → щоденна перевірка прострочень → нагадування
> в Telegram.

## Проблема
Задачі та рахунки із дедлайнами часто забуваються: прострочені оплати,
пропущені звіти. Ручний контроль — це постійне «треба не забути».

## Рішення
- `deadlines.csv` — таблиця задач/рахунків (id, type, title, due_date, amount, status, assignee)
- `deadline-checker.js` — скрипт: читає CSV, знаходить прострочені (overdue)
  та найближчі (≤3 дні) позиції, формує повідомлення.
- `deadline-server.js` — HTTP-сервіс (порт 8792) для виклику з n8n:
  - `GET /health` — перевірка
  - `GET /check?send=1` — перевірка + відправка в Telegram
- `workflow_deadline_daily.json` — n8n-воркфлоу: Schedule Trigger (щоденно о 09:00)
  → HTTP Request до `/check?send=1` → done.

## Автопілот: імпорт вигрузок з папки `ledger-drop/`
Бухгалтер/1С кладе файл вигрузки (CSV) у папку `ledger-drop/`:
```
node watch-import.js            # один прохід: все нове → import → архів у processed/
node watch-import.js --watch    # постійний нагляд (перевірка кожні 30 с)
```
Нові файли імпортуються в `deadlines.csv` (дублікати за id пропускаються)
і переміщуються в `ledger-drop/processed/`. Лог — `import-log.ndjson`.

## Запуск
```
node deadline-checker.js          # dry-run (без відправки)
node deadline-checker.js --send   # з відправкою в Telegram
node deadline-server.js            # HTTP-сервіс (порт 8792)
node watch-import.js --watch       # авто-імпорт вигрузок
```

## Як увімкнути щоденну автоматичну перевірку
1. Переконатися, що `deadline-server.js` запущено (фоновий процес).
2. У n8n імпортувати `workflow_deadline_daily.json`.
3. Активувати воркфлоу (перемикач Active).

## Telegram
- Бот: `@incoming_request_agent_bot`
- Перед першим нагадуванням користувач має написати боту `/start`
  (щоб бот міг надсилати повідомлення).
- chat_id налаштовується через змінну `TELEGRAM_CHAT_ID`
  (за замовчуванням `@alex_d64`).

## Структура
```
project6-deadlines/
  deadlines.csv            # вихідна таблиця
  csv-parse.js             # мінімальний CSV-парсер
  deadline-checker.js      # логіка перевірки + Telegram
  deadline-server.js       # HTTP-обгортка для n8n
  workflow_deadline_daily.json  # n8n-воркфлоу
  checker-log.ndjson       # лог перевірок (створюється)
```

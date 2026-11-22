# SmetaPRO для ПК (Windows) — как устроено и как пересобирать

Версия ПК повторяет версию приложения: сейчас **1.11.25** (package.json → version).

## Что это
- **Широкий интерфейс (с 1.11.26, вариант А — боковое меню):** слой
  `pc-wide.css` + небольшая перестановка узлов в preload.js. При ширине
  окна от 1000px главный экран — тёмная боковая панель навигации
  (кнопки приложения, перемещённые в `.pc-nav`) и список смет справа
  (`.pc-content`); остальные экраны просто используют ширину до 1300px.
  Узкое окно — прежний телефонный вид. Веб-часть при этом по-прежнему
  берётся из мобильного репозитория без изменений.

- Та же программа, что на телефоне: `app/index.html` + `app/db.js` берутся
  из репозитория Smeta-PRO (ветка main) **без изменений**.
- Оболочка — Electron (Chromium), окно Windows, данные (localStorage
  `smeta_pro_v1`) хранятся в профиле пользователя Windows
  (%APPDATA%\Смета PRO) и переживают обновления и переустановку.
- `preload.js` определяет `window.AndroidBridge` с настольными
  реализациями: сохранение файлов — системный диалог, «поделиться» —
  сохранение файла, `shareText` — буфер обмена, печать — window.print()
  (в диалоге печати Windows выбирается принтер или «Microsoft Print to
  PDF»), Excel — настоящие .xlsx (xlsx-export.js, SheetJS), `fetchUrl` —
  загрузка страниц без CORS для обновления каталога.
- НЕ определены: `folder*` («Папка смет» — Android SAF, на ПК выключена
  сама) и `generatePdf/sharePdf` (срабатывает запасной window.print()).
- Обновления: тот же экран, что на телефоне. `updCheck` смотрит GitHub
  Releases **отдельного репозитория ПК-версии** alenjk93-del/Smeta_PRO
  и ищет ассеты `SmetaPRO-PC-Setup-vX.Y.Z.exe`; скачивание с прогрессом,
  установка — запуск скачанного установщика. (Первая ПК-версия 1.11.24
  смотрела в мобильный репозиторий Smeta-PRO; для неё 1.11.25 выложена
  туда один раз переходным релизом pc-v1.11.25, дальше — только Smeta_PRO.)
- Установщик (NSIS): ставится без прав администратора (per-user),
  ярлыки на рабочем столе и в «Пуске», удаление через «Приложения»,
  данные при удалении не трогаются (deleteAppDataOnUninstall=false).
  Ассоциации файлов: .smetabook / .smetaest / .smetatpl открываются
  программой (двойной щелчок → предпросмотр импорта, как на телефоне).

## Пересборка

```bash
cd ~/workspace/smetapro-pc
# при необходимости обновить веб-часть из репозитория:
cp ~/workspace/github/Smeta-PRO/smeta-pro/assets/index.html \
   ~/workspace/github/Smeta-PRO/smeta-pro/assets/db.js app/
# поднять version в package.json (и code в preload.js updVersion,
# и APPVER в installer.nsi)
npm install
npx electron-builder --win --x64 --dir     # начинка: dist/win-unpacked
# свернуть начинку в один архив (установщик распаковывает его 7za.exe):
(cd dist/win-unpacked && zip -r -6 ../payload.zip .)
makensis installer.nsi                     # установщик: dist/*.exe
# результат: dist/SmetaPRO-PC-Setup-v<version>.exe
```

Требования к машине сборки (Linux): Node 20+, Wine **64** (electron-builder
правит ресурсы exe через rcedit; кэш winCodeSign:
`~/.cache/electron-builder/winCodeSign/winCodeSign-2.6.0/rcedit-ia32.exe`
заменён копией rcedit-x64.exe, иначе app-builder падает на wow64) и
**makensis** (пакет nsis). Установщик собирается своим installer.nsi,
а НЕ средствами electron-builder: его NSIS-шаг требует wine32.
Почему нагрузка — одним zip-архивом: makensis 3.09 на этой VM стабильно
умирает (SIGBUS/SIGSEGV) при сборке установщика со сжатием всего дерева
файлов (272 МБ), а вариант «SetCompress off + payload.zip + распаковка
при установке через прилагаемый 7za.exe (7-Zip, свободная лицензия)»
собирается за секунды. Держи /tmp чистым: переполненный tmpfs тоже
роняет makensis.

Самотест после правок оболочки (Xvfb, Linux):
`SMETA_PC_TEST_OUT=/tmp/pc-test.json xvfb-run -a npx electron . --no-sandbox` —
пишет JSON: мост есть, updVersion, рендер главного экрана, localStorage.

## Публикация обновления для пользователей ПК

1. Собрать установщик с новой version.
2. Создать GitHub Release в **alenjk93-del/Smeta_PRO** (репозиторий
   ПК-версии) с тегом vX.Y.Z и приложить `SmetaPRO-PC-Setup-vX.Y.Z.exe`.
   Исходники в этот репозиторий — веткой + Pull Request, merge делает
   владелец вручную, как в мобильном проекте.
3. Установленные ПК-версии увидят обновление при автопроверке после
   запуска или по нажатию на версию.

Подписи у установщика нет (как у DiskRecovery): при первом запуске
Windows покажет SmartScreen — «Подробнее» → «Выполнить в любом случае».

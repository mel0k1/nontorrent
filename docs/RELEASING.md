# Релизы NonTorrent

## Как публикуются релизы

Релизы собирает GitHub Actions (`.github/workflows/build.yml`):

1. Пуш в `main` → сборка Windows (NSIS) + Linux (AppImage, .deb), артефакты во вкладке Actions.
2. Тег `v*` → та же сборка + автоматическая публикация в **Releases**
   (`tauri-action` сам создаёт релиз с установщиками).

```bash
# выпустить новую версию
git tag v0.2.0
git push origin v0.2.0
```

Версия должна совпадать в трёх местах: `package.json`,
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.

## Подпись Windows-установщика (SmartScreen)

Без подписи SmartScreen предупреждает: *«Windows protected your PC — Unknown
publisher»*. Приложение при этом устанавливается: «More info → Run anyway».
Честно убрать предупреждение можно только сертификатом подписи кода.

Конвейер уже готов к подписи. Если в секретах репозитория задан сертификат,
`tauri-bundler` сам подписывает NSIS-установщик (signtool, SHA-256 + метка
времени `timestamp.digicert.com` — подпись остаётся валидной после истечения
сертификата).

### Что нужно сделать

1. Купить сертификат подписи кода:
   - **OV** (Sectigo, Certum, GlobalSign, ~$100–300/год) — убирает
     предупреждение SmartScreen после набора репутации (несколько тысяч
     установок; можно ускорить через бесплатную программу Microsoft
     [Microsoft Partner Center](https://partner.microsoft.com/dashboard)).
   - **EV** (~$250–500/год, SSL.com, Certum) — SmartScreen не ругается сразу,
     репутация не требуется.
2. Экспортировать сертификат в `.pfx` (с паролем).
3. Перевести в base64: `certutil -encode cert.pfx cert.b64` (Windows) или
   `base64 -w0 cert.pfx > cert.b64` (Linux).
4. В репозитории: **Settings → Secrets and variables → Actions → New repository
   secret**:
   - `WINDOWS_CERTIFICATE` — содержимое `cert.b64` (одной строкой);
   - `WINDOWS_CERTIFICATE_PASSWORD` — пароль от .pfx.
5. Следующий тег `v*` соберёт **подписанный** установщик.

### Linux

AppImage и .deb подписывать не принято — доверие обеспечивают репозитории
и контрольные суммы. При желании релиз можно дополнить подписанными
`.sig`-файлами (minisign/gpg) — конвейер не мешает.

### macOS

Сборки пока нет. Для будущей: Apple Developer ID + notarization
(`tauri notarize`), иначе Gatekeeper не пустит установщик вообще.

## Проверка подписи

После установки сертификата и релиза:

```powershell
Get-AuthenticodeSignature .\NonTorrent_0.2.0_x64-setup.exe | Format-List
# Status: Valid — подпись в порядке
```

## Обновления из приложения

Кнопка «Проверить обновления» (Настройки → Обновления) смотрит на
`https://api.github.com/repos/mel0k1/nontorrent/releases/latest`,
сравнивает версии semver-сравнением, скачивает подходящий ассет
(`*-setup.exe` / `.AppImage` / `.deb`) с прогрессом и запускает установку
(Windows: запуск NSIS + выход из приложения; Linux: reveal в файловом
менеджере). Ручная проверка версий не требуется — просто пушьте тег.

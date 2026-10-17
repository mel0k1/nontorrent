//! Watch-папка: следит за каталогом и автоматически добавляет .torrent-файлы.
//!
//! Опрос раз в 5 секунд (без inotify — надёжно и без лишних зависимостей).
//! Обработанные .torrent переносятся в подпапку «added», чтобы не добавлять
//! повторно; если перенос не удался — путь запоминается в памяти сессии.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::{engine, settings};

const WATCH_INTERVAL: std::time::Duration = std::time::Duration::from_secs(5);

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut tick = tokio::time::interval(WATCH_INTERVAL);
        loop {
            tick.tick().await;
            if let Err(e) = watch_tick(&app).await {
                tracing::debug!("watch-папка: {e}");
            }
        }
    });
}

async fn watch_tick(app: &AppHandle) -> Result<(), String> {
    let dir = {
        let state = app.state::<crate::AppState>();
        let v = state.settings.lock().unwrap().watch_dir.clone();
        v
    };
    let dir = dir.trim().to_string();
    if dir.is_empty() {
        return Ok(());
    }
    let dir_path = PathBuf::from(&dir);
    if !dir_path.is_dir() {
        return Ok(());
    }

    let state = app.state::<crate::AppState>();
    let mut torrents: Vec<PathBuf> = std::fs::read_dir(&dir_path)
        .map_err(|e| format!("чтение watch-папки: {e}"))?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.extension()
                    .and_then(|x| x.to_str())
                    .is_some_and(|x| x.eq_ignore_ascii_case("torrent"))
        })
        .collect();
    torrents.sort();
    torrents.retain(|p| {
        let s = p.to_string_lossy().to_string();
        !state.watch_seen.lock().unwrap().contains(&s)
    });
    if torrents.is_empty() {
        return Ok(());
    }

    let session = engine::get_session(app).await?;
    let done_dir = dir_path.join("added");

    for path in torrents {
        let src = path.to_string_lossy().to_string();
        match engine::add_source(&session, &src).await {
            Ok(added) => {
                if !added.already_managed {
                    state.id_source.lock().unwrap().insert(added.id, src.clone());
                    let sources = {
                        let mut persisted = state.persisted.lock().unwrap();
                        if !persisted.contains(&src) {
                            persisted.push(src.clone());
                        }
                        persisted.clone()
                    };
                    let _ = settings::save_persisted(app, &sources);
                    state.added_meta.lock().unwrap().insert(added.id, crate::types::now_ms());
                    tracing::info!("watch: добавлена раздача из {}", path.display());
                }
            }
            Err(e) => {
                tracing::warn!("watch: не удалось добавить «{}»: {e}", path.display());
                // битый .torrent сам не исправится: помечаем файл как *.failed,
                // чтобы не повторять попытку каждые 5 секунд; если rename не взял —
                // запоминаем путь в памяти сессии
                let mut handled = false;
                if let Some(name) = path.file_name() {
                    let failed = dir_path.join(format!("{}.failed", name.to_string_lossy()));
                    if std::fs::rename(&path, &failed).is_ok() {
                        tracing::info!("watch: файл помечен как {}", failed.display());
                        handled = true;
                    }
                }
                if !handled {
                    state.watch_seen.lock().unwrap().insert(src);
                }
                continue;
            }
        }

        // убираем обработанный файл, чтобы не зациклиться на нём
        let moved = match path.file_name() {
            Some(name) => {
                let _ = std::fs::create_dir_all(&done_dir);
                let target = done_dir.join(name);
                if std::fs::rename(&path, &target).is_ok() {
                    true
                } else if std::fs::copy(&path, &target).is_ok() {
                    std::fs::remove_file(&path).is_ok()
                } else {
                    false
                }
            }
            None => false,
        };
        if !moved {
            // не смогли убрать — запомним в сессии, чтобы не добавлять снова
            state
                .watch_seen
                .lock()
                .unwrap()
                .insert(src);
        }
    }
    Ok(())
}

use std::sync::Arc;

use librqbit::{Session, api::TorrentIdOrHash};
use tauri::{AppHandle, Manager};

use crate::{engine, settings, types::*, AppState};
use std::path::PathBuf;

async fn session_or_err(app: &AppHandle) -> Result<Arc<Session>, String> {
    engine::get_session(app).await
}

#[tauri::command]
pub async fn add_torrent(
    app: AppHandle,
    source: String,
    scan_while_downloading: bool,
) -> Result<TorrentDto, String> {
    let session = session_or_err(&app).await?;
    let state = app.state::<AppState>();
    let added = engine::add_source(&session, &source).await?;

    if !added.already_managed {
        {
            state.id_source.lock().unwrap().insert(added.id, source.clone());
            let mut persisted = state.persisted.lock().unwrap();
            if !persisted.contains(&source) {
                persisted.push(source.clone());
            }
        }
        let sources = state.persisted.lock().unwrap().clone();
        let _ = settings::save_persisted(&app, &sources);
        state.added_meta.lock().unwrap().insert(added.id, now_ms());
    }
    if !scan_while_downloading {
        state.scan_disabled.lock().unwrap().insert(added.id);
    }

    Ok(engine::build_dto(&state, added.id, &added.handle))
}

#[tauri::command]
pub async fn list_torrents(app: AppHandle) -> Result<Vec<TorrentDto>, String> {
    let session = session_or_err(&app).await?;
    Ok(engine::snapshot(&app, &session).await)
}

/// Детальная панель раздачи: базовые поля + файлы с вердиктами
#[tauri::command]
pub async fn get_torrent_details(app: AppHandle, id: u32) -> Result<TorrentDetailsDto, String> {
    let session = session_or_err(&app).await?;
    let handle = session
        .get(TorrentIdOrHash::Id(id as usize))
        .ok_or("раздача не найдена")?;
    let state = app.state::<AppState>();
    let base = engine::build_dto(&state, id, &handle);

    let output = handle.output_folder().to_path_buf();
    let only_files = handle.only_files();
    let md_files: Vec<(u32, String, u64)> = handle
        .with_metadata(|md| {
            md.file_infos
                .iter()
                .enumerate()
                .map(|(i, fi)| {
                    (
                        i as u32,
                        fi.relative_filename.to_string_lossy().to_string(),
                        fi.len,
                    )
                })
                .collect()
        })
        .unwrap_or_default();

    let scans = state.scans.lock().unwrap().clone();
    let mut files = Vec::with_capacity(md_files.len());
    for (index, rel, size) in md_files {
        let rel_path = std::path::Path::new(&rel);
        let included = only_files
            .as_ref()
            .map(|o| o.contains(&(index as usize)))
            .unwrap_or(true);
        let full = output.join(&rel);
        // сколько файла уже на диске — так же определяет готовность и сканер
        let on_disk = tokio::fs::metadata(&full).await.map(|m| m.len()).unwrap_or(0);
        let verdict = scans
            .iter()
            .find(|r| r.file == full.to_string_lossy())
            .or_else(|| {
                // сравнение по компонентам пути: «mydir/file.exe» не должна
                // совпасть с «dir/file.exe» при поиске по суффиксу
                scans
                    .iter()
                    .find(|r| std::path::Path::new(&r.file).ends_with(rel_path))
            })
            .map(|r| r.verdict.clone());
        files.push(TorrentFileDto {
            index,
            name: rel,
            size_bytes: size,
            downloaded_bytes: on_disk.min(size),
            included,
            verdict,
        });
    }

    Ok(TorrentDetailsDto {
        torrent: base,
        files,
    })
}

/// Выборочная скачка: оставить в раздаче только указанные файлы
#[tauri::command]
pub async fn set_torrent_files(app: AppHandle, id: u32, indices: Vec<u32>) -> Result<(), String> {
    let session = session_or_err(&app).await?;
    let handle = session
        .get(TorrentIdOrHash::Id(id as usize))
        .ok_or("раздача не найдена")?;
    let set: std::collections::HashSet<usize> = indices.into_iter().map(|i| i as usize).collect();
    session
        .update_only_files(&handle, &set)
        .await
        .map_err(|e| e.to_string())
}

// ---------- карантин: список / восстановление / удаление ----------

fn quarantine_meta(target: &std::path::Path) -> (String, Option<String>, Option<i64>) {
    let meta_path = PathBuf::from(format!("{}.meta.json", target.display()));
    std::fs::read_to_string(meta_path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .map(|j| {
            (
                j["original"].as_str().unwrap_or("").to_string(),
                j["sha256"].as_str().map(|s| s.to_string()),
                j["quarantinedAt"].as_i64(),
            )
        })
        .unwrap_or((String::new(), None, None))
}

fn quarantine_target(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = settings::quarantine_dir(app)?;
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("недопустимое имя файла".into());
    }
    let target = dir.join(name);
    if target.parent() != Some(dir.as_path()) {
        return Err("недопустимое имя файла".into());
    }
    Ok(target)
}

#[tauri::command]
pub async fn list_quarantine(app: AppHandle) -> Result<Vec<QuarantineItemDto>, String> {
    let dir = settings::quarantine_dir(&app)?;
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&dir) {
        let mut paths: Vec<PathBuf> = rd.filter_map(|e| e.ok()).map(|e| e.path()).collect();
        paths.sort();
        for p in paths {
            let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("");
            if ext != "quarantined" {
                continue;
            }
            let name = p
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let size = std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
            let (original, sha256, quarantined_at) = quarantine_meta(&p);
            let file_name = std::path::Path::new(&original)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| name.trim_end_matches(".quarantined").to_string());
            out.push(QuarantineItemDto {
                name,
                original,
                file_name,
                size_bytes: size,
                sha256,
                quarantined_at,
            });
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn restore_quarantine(app: AppHandle, name: String) -> Result<(), String> {
    let target = quarantine_target(&app, &name)?;
    if !target.exists() {
        return Err("файл не найден".into());
    }
    let (original, sha256, _) = quarantine_meta(&target);

    let dest = if original.is_empty() {
        // исходный путь неизвестен — вернём в папку загрузок
        let dl = {
            let state = app.state::<AppState>();
            let v = state.settings.lock().unwrap().download_dir.clone();
            v
        };
        if dl.trim().is_empty() {
            return Err("исходный путь неизвестен — укажите папку загрузок в настройках".into());
        }
        let stem = target
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "restored".into());
        PathBuf::from(dl).join(stem)
    } else {
        PathBuf::from(&original)
    };

    if dest.exists() {
        return Err("по исходному пути уже есть файл".into());
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if std::fs::rename(&target, &dest).is_err() {
        std::fs::copy(&target, &dest).map_err(|e| e.to_string())?;
        std::fs::remove_file(&target).map_err(|e| e.to_string())?;
    }
    let _ = std::fs::remove_file(PathBuf::from(format!("{}.meta.json", target.display())));

    // синхронизируем журнал: файл больше не в карантине
    {
        let state = app.state::<AppState>();
        let mut scans = state.scans.lock().unwrap();
        for r in scans.iter_mut() {
            if !r.quarantined {
                continue;
            }
            let by_path = !original.is_empty() && r.file == original;
            let by_sha = sha256.is_some() && r.sha256 == sha256;
            if by_path || by_sha {
                r.quarantined = false;
            }
        }
    }
    tracing::info!("восстановлено из карантина: {}", dest.display());
    Ok(())
}

#[tauri::command]
pub async fn delete_quarantine(app: AppHandle, name: String) -> Result<(), String> {
    let target = quarantine_target(&app, &name)?;
    let (original, sha256, _) = quarantine_meta(&target);
    if target.exists() {
        std::fs::remove_file(&target).map_err(|e| e.to_string())?;
    }
    let _ = std::fs::remove_file(PathBuf::from(format!("{}.meta.json", target.display())));

    // синхронизируем журнал: файла больше нигде нет — метку карантина снимаем,
    // чтобы кнопка «В карантин» не ссылалась на несуществующий файл
    {
        let state = app.state::<AppState>();
        let mut scans = state.scans.lock().unwrap();
        for r in scans.iter_mut() {
            if !r.quarantined {
                continue;
            }
            let by_path = !original.is_empty() && r.file == original;
            let by_sha = sha256.is_some() && r.sha256 == sha256;
            if by_path || by_sha {
                r.quarantined = false;
            }
        }
    }
    tracing::info!("удалено из карантина: {}", name);
    Ok(())
}

#[tauri::command]
pub async fn pause_torrent(app: AppHandle, id: u32) -> Result<(), String> {
    let session = session_or_err(&app).await?;
    let handle = session
        .get(TorrentIdOrHash::Id(id as usize))
        .ok_or("раздача не найдена")?;
    session.pause(&handle).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resume_torrent(app: AppHandle, id: u32) -> Result<(), String> {
    let session = session_or_err(&app).await?;
    let handle = session
        .get(TorrentIdOrHash::Id(id as usize))
        .ok_or("раздача не найдена")?;
    session.unpause(&handle).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_torrent(app: AppHandle, id: u32, delete_files: bool) -> Result<(), String> {
    let session = session_or_err(&app).await?;
    session
        .delete(TorrentIdOrHash::Id(id as usize), delete_files)
        .await
        .map_err(|e| e.to_string())?;

    let state = app.state::<AppState>();
    let source = state.id_source.lock().unwrap().remove(&id);
    if let Some(src) = source {
        let sources = {
            let mut persisted = state.persisted.lock().unwrap();
            persisted.retain(|s| *s != src);
            persisted.clone()
        };
        let _ = settings::save_persisted(&app, &sources);
    }
    state.scan_states.lock().unwrap().remove(&id);
    state.added_meta.lock().unwrap().remove(&id);
    state.completed_scanned.lock().unwrap().remove(&id);
    state.scan_disabled.lock().unwrap().remove(&id);
    state
        .scanned_paths
        .lock()
        .unwrap()
        .retain(|(tid, _)| *tid != id);
    Ok(())
}

#[tauri::command]
pub async fn session_stats(app: AppHandle) -> Result<SessionStatsDto, String> {
    let Ok(session) = engine::get_session(&app).await else {
        return Ok(SessionStatsDto::default());
    };
    let list: Vec<Arc<librqbit::ManagedTorrent>> =
        session.with_torrents(|it| it.map(|(_, t)| t.clone()).collect());

    let mut down = 0u64;
    let mut up = 0u64;
    for t in &list {
        if let Some(l) = t.stats().live.as_ref() {
            down += l.download_speed.as_bytes();
            up += l.upload_speed.as_bytes();
        }
    }
    let dht_nodes = session
        .get_dht()
        .map(|d| {
            let s = d.get_stats();
            (s.routing_table_size + s.routing_table_size_v6) as u32
        })
        .unwrap_or(0);

    Ok(SessionStatsDto {
        down_bytes_per_sec: down,
        up_bytes_per_sec: up,
        dht_nodes,
        torrent_count: list.len() as u32,
    })
}

#[tauri::command]
pub async fn get_scan_log(app: AppHandle) -> Result<Vec<ScanReportDto>, String> {
    let state = app.state::<AppState>();
    let scans = state.scans.lock().unwrap().clone();
    Ok(scans)
}

#[tauri::command]
pub async fn get_settings(app: AppHandle) -> Result<SettingsDto, String> {
    let state = app.state::<AppState>();
    let settings = state.settings.lock().unwrap().clone();
    Ok(settings)
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: SettingsDto) -> Result<(), String> {
    let state = app.state::<AppState>();
    *state.settings.lock().unwrap() = settings.clone();
    crate::settings::save_settings(&app, &settings)
}

#[tauri::command]
pub async fn open_folder(app: AppHandle, id: u32) -> Result<(), String> {
    let session = session_or_err(&app).await?;
    let handle = session
        .get(TorrentIdOrHash::Id(id as usize))
        .ok_or("раздача не найдена")?;
    let dir = handle.output_folder().to_path_buf();
    tauri_plugin_opener::open_path(&dir, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn quarantine_entry(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let (path, sha) = {
        let scans = state.scans.lock().unwrap();
        let report = scans.iter().find(|r| r.id == id).ok_or("запись не найдена")?;
        (report.file.clone(), report.sha256.clone())
    };
    settings::quarantine_file(&app, std::path::Path::new(&path), sha.as_deref())?;

    let mut scans = state.scans.lock().unwrap();
    if let Some(report) = scans.iter_mut().find(|r| r.id == id) {
        report.quarantined = true;
    }
    Ok(())
}

#[tauri::command]
pub async fn pause_all_torrents(app: AppHandle) -> Result<(), String> {
    engine::set_all_paused(&app, true).await
}

#[tauri::command]
pub async fn resume_all_torrents(app: AppHandle) -> Result<(), String> {
    engine::set_all_paused(&app, false).await
}

#[tauri::command]
pub async fn get_autostart(app: AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch()
        .is_enabled()
        .map_err(|e| format!("автозапуск: {e}"))
}

#[tauri::command]
pub async fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let autolaunch = app.autolaunch();
    let result = if enabled {
        autolaunch.enable()
    } else {
        autolaunch.disable()
    };
    result.map_err(|e| format!("автозапуск: {e}"))
}

/// Сводка о безопасности: правила YARA, кэш VT, карантин
#[tauri::command]
pub async fn get_security_info(app: AppHandle) -> Result<SecurityInfoDto, String> {
    let state = app.state::<AppState>();

    let (yara_rules, custom_rule_files) = {
        let guard = state.yara.lock().unwrap();
        match guard.as_ref() {
            Some(e) => (e.rule_count, e.custom_files),
            None => (0, 0),
        }
    };

    let vt_cache_entries = state.vt_cache.lock().unwrap().len() as u32;

    let quarantined_files = settings::quarantine_dir(&app)
        .ok()
        .and_then(|dir| std::fs::read_dir(dir).ok())
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .filter(|e| {
                    e.path()
                        .extension()
                        .and_then(|x| x.to_str())
                        .is_some_and(|x| x == "quarantined")
                })
                .count() as u32
        })
        .unwrap_or(0);

    Ok(SecurityInfoDto {
        yara_rules,
        custom_rule_files,
        vt_cache_entries,
        quarantined_files,
    })
}

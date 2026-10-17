use std::sync::Arc;

use librqbit::{Session, api::TorrentIdOrHash};
use tauri::{AppHandle, Manager};

use crate::{engine, settings, types::*, AppState};

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

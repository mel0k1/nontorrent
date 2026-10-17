use std::{path::PathBuf, sync::Arc, time::Duration};

use librqbit::{
    AddTorrent, AddTorrentOptions, AddTorrentResponse, ManagedTorrent, Session, SessionOptions,
    TorrentStatsState,
};
use tauri::{AppHandle, Manager};

use crate::{scanner::ScanJob, settings, types::*};

pub struct Engine {
    pub session: Arc<Session>,
}

pub struct AddedTorrent {
    pub id: u32,
    pub handle: Arc<ManagedTorrent>,
    pub already_managed: bool,
}

pub async fn get_session(app: &AppHandle) -> Result<Arc<Session>, String> {
    let state = app.state::<crate::AppState>();
    let guard = state.engine.read().await;
    guard
        .as_ref()
        .map(|e| e.session.clone())
        .ok_or_else(|| "движок ещё инициализируется".into())
}

async fn start_session(app: &AppHandle) -> Result<Arc<Session>, String> {
    let state = app.state::<crate::AppState>();
    let app_settings = state.settings.lock().unwrap().clone();

    let base = if app_settings.download_dir.trim().is_empty() {
        dirs::download_dir()
            .or_else(dirs::home_dir)
            .unwrap_or_else(|| PathBuf::from("."))
    } else {
        PathBuf::from(&app_settings.download_dir)
    };
    std::fs::create_dir_all(&base).map_err(|e| format!("папка загрузок: {e}"))?;

    Session::new_with_opts(base, SessionOptions::default())
        .await
        .map_err(|e| format!("сессия librqbit: {e}"))
}

pub async fn add_source(session: &Arc<Session>, source: &str) -> Result<AddedTorrent, String> {
    let add = AddTorrent::from_cli_argument(source).map_err(|e| format!("источник: {e}"))?;
    let resp = session
        .add_torrent(
            add,
            Some(AddTorrentOptions {
                paused: false,
                ..Default::default()
            }),
        )
        .await
        .map_err(|e| format!("не удалось добавить раздачу: {e}"))?;

    match resp {
        AddTorrentResponse::Added(id, h) => Ok(AddedTorrent {
            id: id as u32,
            handle: h,
            already_managed: false,
        }),
        AddTorrentResponse::AlreadyManaged(id, h) => Ok(AddedTorrent {
            id: id as u32,
            handle: h,
            already_managed: true,
        }),
        AddTorrentResponse::ListOnly(_) => Err("list-only недоступен в приложении".into()),
    }
}

/// Запуск: настройки → воркер сканера → сессия → восстановление раздач → поллер
pub fn bootstrap(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let state = app.state::<crate::AppState>();
        {
            let loaded = settings::load_settings(&app);
            *state.settings.lock().unwrap() = loaded;
        }

        let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<ScanJob>();
        *state.scan_tx.lock().unwrap() = Some(tx.clone());
        crate::scanner::spawn_worker(rx, app.clone());

        match start_session(&app).await {
            Ok(session) => {
                let sources = settings::load_persisted(&app);
                *state.persisted.lock().unwrap() = sources.clone();
                for src in sources {
                    match add_source(&session, &src).await {
                        Ok(added) => {
                            state.added_meta.lock().unwrap().insert(added.id, now_ms());
                            state
                                .id_source
                                .lock()
                                .unwrap()
                                .insert(added.id, src.clone());
                        }
                        Err(e) => tracing::warn!("восстановление «{src}»: {e}"),
                    }
                }
                *state.engine.write().await = Some(Arc::new(Engine { session }));
                tracing::info!("движок librqbit запущен");
            }
            Err(e) => {
                tracing::error!("движок не запустился: {e}");
                *state.scan_tx.lock().unwrap() = None;
                return;
            }
        }

        poll_loop(app, tx).await;
    });
}

/// Поллер: раз в 2 сек обходит раздачи и ставит файлы в очередь сканера
async fn poll_loop(app: AppHandle, tx: tokio::sync::mpsc::UnboundedSender<ScanJob>) {
    let mut tick = tokio::time::interval(Duration::from_secs(2));
    loop {
        tick.tick().await;
        let Ok(session) = get_session(&app).await else {
            continue;
        };
        let state = app.state::<crate::AppState>();
        let scan_enabled = state.settings.lock().unwrap().scan_while_downloading;

        let list: Vec<(usize, Arc<ManagedTorrent>)> =
            session.with_torrents(|it| it.map(|(id, t)| (id, t.clone())).collect());

        for (id, t) in list {
            let tid = id as u32;
            let stats = t.stats();

            // полный скан каталога после завершения раздачи
            if stats.finished {
                let mut done = state.completed_scanned.lock().unwrap();
                if !done.contains(&tid) {
                    done.insert(tid);
                    drop(done);
                    let _ = tx.send(ScanJob {
                        torrent_id: Some(tid),
                        path: PathBuf::from(t.output_folder()),
                        torrent_name: t.name(),
                        reason: "complete",
                    });
                }
                continue;
            }

            if t.is_paused()
                || !scan_enabled
                || state.scan_disabled.lock().unwrap().contains(&tid)
            {
                continue;
            }

            // инкрементальный скан: файл готов, когда его размер на диске совпал с ожидаемым
            let files: Vec<(String, u64)> = t
                .with_metadata(|md| {
                    md.file_infos
                        .iter()
                        .map(|fi| {
                            (
                                fi.relative_filename.to_string_lossy().to_string(),
                                fi.len,
                            )
                        })
                        .collect()
                })
                .unwrap_or_default();

            if files.is_empty() {
                continue;
            }

            {
                let mut map = state.scan_states.lock().unwrap();
                let entry = map.entry(tid).or_insert_with(|| ScanStateDto {
                    verdict: "pending".into(),
                    threats_found: 0,
                    scanned_files: 0,
                    total_files: 0,
                    last_scan_at: None,
                });
                entry.total_files = files.len() as u32;
            }

            let base = PathBuf::from(t.output_folder());
            for (rel, len) in &files {
                let key = (tid, rel.clone());
                if state.scanned_paths.lock().unwrap().contains(&key) {
                    continue;
                }
                let full = base.join(rel);
                if let Ok(m) = tokio::fs::metadata(&full).await {
                    if m.len() == *len {
                        state.scanned_paths.lock().unwrap().insert(key);
                        let _ = tx.send(ScanJob {
                            torrent_id: Some(tid),
                            path: full,
                            torrent_name: t.name(),
                            reason: "during",
                        });
                    }
                }
            }
        }
    }
}

// ---------- построение DTO ----------

pub fn build_dto(state: &crate::AppState, id: u32, t: &Arc<ManagedTorrent>) -> TorrentDto {
    let stats = t.stats();

    let (down, up, peers, seeds) = match stats.live.as_ref() {
        Some(l) => (
            l.download_speed.as_bytes(),
            l.upload_speed.as_bytes(),
            l.snapshot.peer_stats.live,
            l.snapshot.peer_stats.seen.max(l.snapshot.peer_stats.live),
        ),
        None => (0, 0, 0, 0),
    };

    let status: String = match &stats.state {
        TorrentStatsState::Error => "error",
        TorrentStatsState::Initializing { .. } => {
            if t.is_paused() {
                "paused"
            } else {
                "checking"
            }
        }
        TorrentStatsState::Paused => "paused",
        TorrentStatsState::Live => {
            if t.name().is_none() {
                "metadata"
            } else if stats.finished {
                "seeding"
            } else {
                "downloading"
            }
        }
    }
    .into();

    let progress = if stats.total_bytes > 0 {
        (stats.progress_bytes as f64 / stats.total_bytes as f64 * 1000.0).round() / 10.0
    } else {
        0.0
    };

    let eta_seconds = if !stats.finished && down > 0 {
        Some(stats.total_bytes.saturating_sub(stats.progress_bytes) / down.max(1))
    } else {
        None
    };

    let scan = state.scan_states.lock().unwrap().get(&id).cloned();
    let added_at = state.added_meta.lock().unwrap().get(&id).copied().unwrap_or_else(now_ms);

    TorrentDto {
        id,
        name: t
            .name()
            .unwrap_or_else(|| format!("раздача #{id}")),
        info_hash: Some(t.info_hash().as_string()),
        size_bytes: stats.total_bytes,
        downloaded_bytes: stats.progress_bytes,
        uploaded_bytes: stats.uploaded_bytes,
        down_speed: down,
        up_speed: up,
        peers,
        seeds,
        status,
        progress,
        eta_seconds,
        output_path: t.output_folder().to_string_lossy().to_string(),
        added_at,
        scan,
    }
}

pub async fn snapshot(app: &AppHandle, session: &Arc<Session>) -> Vec<TorrentDto> {
    let state = app.state::<crate::AppState>();
    let list: Vec<(usize, Arc<ManagedTorrent>)> =
        session.with_torrents(|it| it.map(|(id, t)| (id, t.clone())).collect());
    let mut out: Vec<TorrentDto> = list
        .iter()
        .map(|(id, t)| build_dto(&state, *id as u32, t))
        .collect();
    out.sort_by_key(|d| std::cmp::Reverse(d.added_at));
    out
}

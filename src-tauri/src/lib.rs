mod commands;
mod engine;
mod scanner;
mod settings;
mod types;

use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
};

use tokio::sync::RwLock;

use crate::scanner::ScanJob;
use types::{ScanReportDto, ScanStateDto, SettingsDto};

pub struct AppState {
    pub engine: Arc<RwLock<Option<Arc<engine::Engine>>>>,
    pub settings: Arc<Mutex<SettingsDto>>,
    pub scans: Arc<Mutex<Vec<ScanReportDto>>>,
    pub scan_states: Arc<Mutex<HashMap<u32, ScanStateDto>>>,
    pub scan_tx: Arc<Mutex<Option<tokio::sync::mpsc::UnboundedSender<ScanJob>>>>,
    pub added_meta: Arc<Mutex<HashMap<u32, i64>>>,
    pub id_source: Arc<Mutex<HashMap<u32, String>>>,
    pub persisted: Arc<Mutex<Vec<String>>>,
    pub scan_disabled: Arc<Mutex<HashSet<u32>>>,
    pub scanned_paths: Arc<Mutex<HashSet<(u32, String)>>>,
    pub completed_scanned: Arc<Mutex<HashSet<u32>>>,
    pub vt_cache: Arc<Mutex<HashMap<String, (String, Vec<String>)>>>,
    pub vt_last: Arc<Mutex<Option<std::time::Instant>>>,
}

impl AppState {
    fn new() -> Self {
        Self {
            engine: Arc::new(RwLock::new(None)),
            settings: Arc::new(Mutex::new(SettingsDto::default())),
            scans: Arc::new(Mutex::new(Vec::new())),
            scan_states: Arc::new(Mutex::new(HashMap::new())),
            scan_tx: Arc::new(Mutex::new(None)),
            added_meta: Arc::new(Mutex::new(HashMap::new())),
            id_source: Arc::new(Mutex::new(HashMap::new())),
            persisted: Arc::new(Mutex::new(Vec::new())),
            scan_disabled: Arc::new(Mutex::new(HashSet::new())),
            scanned_paths: Arc::new(Mutex::new(HashSet::new())),
            completed_scanned: Arc::new(Mutex::new(HashSet::new())),
            vt_cache: Arc::new(Mutex::new(HashMap::new())),
            vt_last: Arc::new(Mutex::new(None)),
        }
    }
}

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .try_init()
        .ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(AppState::new());
            engine::bootstrap(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::add_torrent,
            commands::list_torrents,
            commands::pause_torrent,
            commands::resume_torrent,
            commands::remove_torrent,
            commands::session_stats,
            commands::get_scan_log,
            commands::get_settings,
            commands::save_settings,
            commands::open_folder,
            commands::quarantine_entry,
        ])
        .run(tauri::generate_context!())
        .expect("NonTorrent: не удалось запустить приложение");
}

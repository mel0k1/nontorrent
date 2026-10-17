mod commands;
mod engine;
mod scheduler;
mod scanner;
mod settings;
mod tray;
mod types;
mod updates;
mod vt;
mod vt_cache;
mod yara;

use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
};

use tauri::{Manager, WindowEvent};
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
    /// Кэш вердиктов VT (загружается с диска при старте, сохраняется при пополнении)
    pub vt_cache: Arc<Mutex<vt_cache::VtCacheMap>>,
    pub vt_last: Arc<Mutex<Option<std::time::Instant>>>,
    /// YARA-движок (компилируется при старте, правила из бинаря + папка пользователя)
    pub yara: Arc<Mutex<Option<yara::YaraEngine>>>,
    pub update_busy: Arc<std::sync::atomic::AtomicBool>,
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
            yara: Arc::new(Mutex::new(None)),
            update_busy: Arc::new(std::sync::atomic::AtomicBool::new(false)),
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
        // single-instance первым: второй запуск лишь поднимает окно первого
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // автозапуск: регистрируется в ОС только по явному включению в настройках
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .setup(|app| {
            app.manage(AppState::new());

            // YARA-правила и дисковый кэш VT — сразу при старте
            {
                let state = app.state::<AppState>();
                *state.yara.lock().unwrap() = Some(yara::YaraEngine::load(app.handle()));
                if let Ok(path) = settings::vt_cache_path(app.handle()) {
                    let loaded = vt_cache::load(&path);
                    tracing::info!("кэш вердиктов VT: {} записей", loaded.len());
                    *state.vt_cache.lock().unwrap() = loaded;
                }
            }

            tray::build(app.handle())?;
            scheduler::spawn(app.handle().clone());
            engine::bootstrap(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            // закрытие окна сворачивает в трей (настраивается в приложении)
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let close_to_tray = {
                    let state = app.state::<AppState>();
                    // промежуточная переменная: guard должен умереть до конца блока
                    let v = state.settings.lock().unwrap().close_to_tray;
                    v
                };
                if close_to_tray {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::add_torrent,
            commands::list_torrents,
            commands::pause_torrent,
            commands::resume_torrent,
            commands::remove_torrent,
            commands::pause_all_torrents,
            commands::resume_all_torrents,
            commands::session_stats,
            commands::get_scan_log,
            commands::get_settings,
            commands::save_settings,
            commands::open_folder,
            commands::quarantine_entry,
            commands::get_autostart,
            commands::set_autostart,
            commands::get_security_info,
            updates::check_updates,
            updates::download_update,
            updates::install_update,
        ])
        .run(tauri::generate_context!())
        .expect("NonTorrent: не удалось запустить приложение");
}

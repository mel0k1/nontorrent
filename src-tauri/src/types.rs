use serde::{Deserialize, Serialize};

// ---------- DTO, которые уходят на фронт (camelCase по контракту из src/types.ts) ----------

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanStateDto {
    pub verdict: String,
    pub threats_found: u32,
    pub scanned_files: u32,
    pub total_files: u32,
    pub last_scan_at: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TorrentDto {
    pub id: u32,
    pub name: String,
    pub info_hash: Option<String>,
    pub size_bytes: u64,
    pub downloaded_bytes: u64,
    pub uploaded_bytes: u64,
    pub down_speed: u64,
    pub up_speed: u64,
    pub peers: u32,
    pub seeds: u32,
    pub status: String,
    pub progress: f64,
    pub eta_seconds: Option<u64>,
    pub output_path: String,
    pub added_at: i64,
    pub scan: Option<ScanStateDto>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanReportDto {
    pub id: String,
    pub file: String,
    pub torrent_name: Option<String>,
    pub size_bytes: u64,
    pub sha256: Option<String>,
    pub verdict: String,
    pub detections: Vec<String>,
    pub engines: Vec<String>,
    pub scanned_at: i64,
    pub quarantined: bool,
}

/// Правило планировщика скорости.
/// days: 0 = понедельник … 6 = воскресенье.
/// Время «HH:MM»; start > end означает окно через полночь.
/// Пустое поле лимита = без ограничений, 0 = блокировка.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerRule {
    pub days: Vec<u8>,
    pub start: String,
    pub end: String,
    pub down_mbps: Option<f64>,
    pub up_mbps: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SettingsDto {
    pub download_dir: String,
    pub scan_while_downloading: bool,
    pub quarantine_threats: bool,
    pub vt_api_key: String,
    pub use_builtin_vt: bool,
    pub clamd_address: String,
    pub max_down_mbps: Option<f64>,
    pub max_up_mbps: Option<f64>,
    /// YARA-сканирование локальными сигнатурами
    pub yara_enabled: bool,
    /// Сворачивать в трей при закрытии окна (иначе — выход)
    pub close_to_tray: bool,
    /// Запуск вместе с ОС (по умолчанию ВЫКЛ, меняется только в настройках)
    pub autostart: bool,
    /// Планировщик скорости
    pub scheduler_enabled: bool,
    pub scheduler_rules: Vec<SchedulerRule>,
}

impl Default for SettingsDto {
    fn default() -> Self {
        Self {
            download_dir: String::new(),
            scan_while_downloading: true,
            quarantine_threats: true,
            vt_api_key: String::new(),
            use_builtin_vt: true,
            clamd_address: String::new(),
            max_down_mbps: None,
            max_up_mbps: None,
            yara_enabled: true,
            close_to_tray: true,
            autostart: false,
            scheduler_enabled: false,
            scheduler_rules: Vec::new(),
        }
    }
}

/// Сводка о подсистеме безопасности (для карточек на странице «Безопасность»)
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SecurityInfoDto {
    pub yara_rules: u32,
    pub custom_rule_files: u32,
    pub vt_cache_entries: u32,
    pub quarantined_files: u32,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatsDto {
    pub down_bytes_per_sec: u64,
    pub up_bytes_per_sec: u64,
    pub dht_nodes: u32,
    pub torrent_count: u32,
}

/// Правило планировщика скорости.
/// days: 0 = понедельник … 6 = воскресенье.
/// Время «HH:MM»; start > end означает окно через полночь.
/// Пустое поле лимита = без ограничений, 0 = блокировка.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerRule {
    pub days: Vec<u8>,
    pub start: String,
    pub end: String,
    pub down_mbps: Option<f64>,
    pub up_mbps: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SettingsDto {
    pub download_dir: String,
    pub scan_while_downloading: bool,
    pub quarantine_threats: bool,
    pub vt_api_key: String,
    pub use_builtin_vt: bool,
    pub clamd_address: String,
    pub max_down_mbps: Option<f64>,
    pub max_up_mbps: Option<f64>,
    /// YARA-сканирование локальными сигнатурами
    pub yara_enabled: bool,
    /// Сворачивать в трей при закрытии окна (иначе — выход)
    pub close_to_tray: bool,
    /// Запуск вместе с ОС (по умолчанию ВЫКЛ, меняется только в настройках)
    pub autostart: bool,
    /// Планировщик скорости
    pub scheduler_enabled: bool,
    pub scheduler_rules: Vec<SchedulerRule>,
}

impl Default for SettingsDto {
    fn default() -> Self {
        Self {
            download_dir: String::new(),
            scan_while_downloading: true,
            quarantine_threats: true,
            vt_api_key: String::new(),
            use_builtin_vt: true,
            clamd_address: String::new(),
            max_down_mbps: None,
            max_up_mbps: None,
            yara_enabled: true,
            close_to_tray: true,
            autostart: false,
            scheduler_enabled: false,
            scheduler_rules: Vec::new(),
        }
    }
}

/// Сводка о подсистеме безопасности (для карточек на странице «Безопасность»)
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SecurityInfoDto {
    pub yara_rules: u32,
    pub custom_rule_files: u32,
    pub vt_cache_entries: u32,
    pub quarantined_files: u32,
}

// ---------- вспомогательное ----------

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn verdict_rank(v: &str) -> u8 {
    match v {
        "malicious" => 3,
        "suspicious" => 2,
        "clean" => 1,
        _ => 0,
    }
}

/// Худший из двух вердиктов (для агрегата по раздаче)
pub fn worst_verdict(a: &str, b: &str) -> String {
    if verdict_rank(b) > verdict_rank(a) {
        b.to_string()
    } else {
        a.to_string()
    }
}

static SCAN_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

pub fn next_scan_id() -> String {
    let n = SCAN_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    format!("scan-{}-{n}", now_ms())
}

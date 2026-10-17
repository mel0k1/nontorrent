use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::types::{SettingsDto, now_ms};

// Каталоги приложения: настройки, список раздач, карантин

pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("нет каталога данных приложения: {e}"))
}

pub fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("settings.json"))
}

pub fn persisted_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("torrents.json"))
}

pub fn quarantine_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("quarantine"))
}

pub fn load_settings(app: &AppHandle) -> SettingsDto {
    settings_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_settings(app: &AppHandle, s: &SettingsDto) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

pub fn load_persisted(app: &AppHandle) -> Vec<String> {
    persisted_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
        .unwrap_or_default()
}

pub fn save_persisted(app: &AppHandle, sources: &[String]) -> Result<(), String> {
    let path = persisted_path(app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(sources).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

/// Изолировать файл в карантин: переименовать, при неудаче скопировать и удалить.
/// Рядом кладётся meta-файл с происхождением угрозы.
pub fn quarantine_file(
    app: &AppHandle,
    path: &std::path::Path,
    sha256: Option<&str>,
) -> Result<PathBuf, String> {
    if !path.exists() {
        return Err("файл не найден".into());
    }
    let dir = quarantine_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".into());
    let key = sha256
        .map(|s| s.chars().take(16).collect::<String>())
        .unwrap_or_else(|| format!("{}", now_ms()));
    let target = dir.join(format!("{stem}.{key}.quarantined"));

    if std::fs::rename(path, &target).is_err() {
        std::fs::copy(path, &target).map_err(|e| e.to_string())?;
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }

    let meta = serde_json::json!({
        "original": path.to_string_lossy(),
        "sha256": sha256,
        "quarantinedAt": now_ms(),
    });
    let _ = std::fs::write(
        dir.join(format!("{target}.meta.json")),
        serde_json::to_string_pretty(&meta).unwrap_or_default(),
    );

    Ok(target)
}

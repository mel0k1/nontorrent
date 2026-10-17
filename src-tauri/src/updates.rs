//! Проверка и установка обновлений через GitHub Releases.
//!
//! Проверка: GET releases/latest, сравнение версий с текущей.
//! Скачивание: стриминговое, с событием update://progress для UI.
//! Установка: Windows — запуск NSIS-установщика и выход из приложения;
//! Linux — chmod +x для AppImage и показ файла в менеджере.

use std::io::Write as _;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::settings;

const RELEASES_API: &str = "https://api.github.com/repos/mel0k1/nontorrent/releases/latest";
const USER_AGENT: &str = concat!("NonTorrent/", env!("CARGO_PKG_VERSION"));

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAssetDto {
    pub name: String,
    pub url: String,
    pub size: u64,
    /// windows-setup | linux-deb | linux-appimage | other
    pub kind: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfoDto {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub notes: Option<String>,
    pub published_at: Option<String>,
    pub assets: Vec<UpdateAssetDto>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgressDto {
    pub percent: f64,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub done: bool,
}

fn asset_kind(name: &str) -> String {
    let n = name.to_lowercase();
    if n.ends_with("-setup.exe") || n.ends_with("-install.exe") {
        "windows-setup".into()
    } else if n.ends_with(".deb") {
        "linux-deb".into()
    } else if n.ends_with(".appimage") {
        "linux-appimage".into()
    } else {
        "other".into()
    }
}

/// «0.1.0» / «v0.2.1» → [0,1,0]. Нестандартные суффиксы отбрасываются.
fn parse_version(v: &str) -> Vec<u64> {
    v.trim()
        .trim_start_matches('v')
        .split(|c| c == '.' || c == '-')
        .filter_map(|p| p.parse::<u64>().ok())
        .collect()
}

fn is_newer(latest: &str, current: &str) -> bool {
    let a = parse_version(latest);
    let b = parse_version(current);
    for i in 0..3 {
        let x = a.get(i).copied().unwrap_or(0);
        let y = b.get(i).copied().unwrap_or(0);
        if x != y {
            return x > y;
        }
    }
    false
}

#[tauri::command]
pub async fn check_updates(app: AppHandle) -> Result<UpdateInfoDto, String> {
    let current = app.package_info().version.to_string();

    let client = reqwest::Client::new();
    let resp = client
        .get(RELEASES_API)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("нет связи с GitHub: {e}"))?;

    if resp.status().as_u16() == 404 {
        // релизов ещё не было
        return Ok(UpdateInfoDto {
            current_version: current,
            latest_version: None,
            update_available: false,
            notes: None,
            published_at: None,
            assets: Vec::new(),
        });
    }
    if !resp.status().is_success() {
        return Err(format!("GitHub API: HTTP {}", resp.status()));
    }

    let rel: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let tag = rel["tag_name"].as_str().unwrap_or("").to_string();
    let latest = if tag.is_empty() { None } else { Some(tag) };

    let mut assets: Vec<UpdateAssetDto> = rel["assets"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    let name = a["name"].as_str()?.to_string();
                    let url = a["browser_download_url"].as_str()?.to_string();
                    let kind = asset_kind(&name);
                    if kind == "other" {
                        return None;
                    }
                    Some(UpdateAssetDto {
                        name,
                        url,
                        size: a["size"].as_u64().unwrap_or(0),
                        kind,
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    assets.sort_by(|x, y| x.kind.cmp(&y.kind));

    let update_available = latest
        .as_deref()
        .map(|l| is_newer(l, &current))
        .unwrap_or(false);

    Ok(UpdateInfoDto {
        current_version: current,
        latest_version: latest,
        update_available,
        notes: rel["body"].as_str().map(|s| s.chars().take(2000).collect()),
        published_at: rel["published_at"].as_str().map(|s| s.to_string()),
        assets,
    })
}

#[tauri::command]
pub async fn download_update(app: AppHandle, url: String, name: String) -> Result<String, String> {
    if !url.starts_with("https://") {
        return Err("небезопасный адрес загрузки".into());
    }
    let state = app.state::<crate::AppState>();
    if state
        .update_busy
        .compare_exchange(false, true, std::sync::atomic::Ordering::SeqCst, std::sync::atomic::Ordering::SeqCst)
        .is_err()
    {
        return Err("загрузка уже идёт".into());
    }

    let result = download_inner(app.clone(), url, name).await;
    state.update_busy.store(false, std::sync::atomic::Ordering::SeqCst);
    result
}

async fn download_inner(app: AppHandle, url: String, name: String) -> Result<String, String> {
    let dir = settings::app_data_dir(&app)?.join("updates");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // имя файла приводим к безопасному: только буквы/цифры/точка/дефис/подчёрк
    let safe: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, '.' | '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let dest = dir.join(&safe);
    let partial = dir.join(format!("{safe}.part"));

    let client = reqwest::Client::new();
    let mut resp = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("запрос не удался: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("GitHub: HTTP {}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);
    let mut file = std::fs::File::create(&partial).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut next_report = 0u64;

    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        if downloaded >= next_report {
            let percent = if total > 0 { downloaded as f64 / total as f64 * 100.0 } else { 0.0 };
            let _ = app.emit(
                "update://progress",
                UpdateProgressDto {
                    percent,
                    downloaded_bytes: downloaded,
                    total_bytes: total,
                    done: false,
                },
            );
            next_report = downloaded + 512 * 1024;
        }
    }
    file.flush().ok();
    drop(file);

    std::fs::rename(&partial, &dest).map_err(|e| e.to_string())?;

    let _ = app.emit(
        "update://progress",
        UpdateProgressDto {
            percent: 100.0,
            downloaded_bytes: downloaded,
            total_bytes: total.max(downloaded),
            done: true,
        },
    );

    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn install_update(app: AppHandle, path: String, kind: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    if !p.exists() {
        return Err("файл установщика не найден".into());
    }

    match kind.as_str() {
        "windows-setup" => {
            #[cfg(target_os = "windows")]
            {
                std::process::Command::new(&p)
                    .spawn()
                    .map_err(|e| format!("не удалось запустить установщик: {e}"))?;
                // даём установщику стартовать и закрываем приложение
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(800)).await;
                    app.exit(0);
                });
                Ok(())
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = &app;
                Err("установщик Windows не может быть запущен на этой ОС".into())
            }
        }
        "linux-appimage" => {
            #[cfg(target_os = "linux")]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755))
                    .map_err(|e| e.to_string())?;
                tauri_plugin_opener::reveal_item_in_dir(&p).map_err(|e| e.to_string())
            }
            #[cfg(not(target_os = "linux"))]
            {
                let _ = &app;
                Err("AppImage доступен только на Linux".into())
            }
        }
        "linux-deb" => {
            #[cfg(target_os = "linux")]
            {
                tauri_plugin_opener::reveal_item_in_dir(&p).map_err(|e| e.to_string())
            }
            #[cfg(not(target_os = "linux"))]
            {
                let _ = &app;
                Err(".deb доступен только на Linux".into())
            }
        }
        _ => Err("неизвестный тип установщика".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_compare() {
        assert!(is_newer("v0.2.0", "0.1.0"));
        assert!(is_newer("0.1.10", "0.1.9"));
        assert!(!is_newer("0.1.0", "v0.1.0"));
        assert!(!is_newer("0.0.9", "0.1.0"));
    }

    #[test]
    fn asset_kinds() {
        assert_eq!(asset_kind("NonTorrent_0.1.0_x64-setup.exe"), "windows-setup");
        assert_eq!(asset_kind("nontorrent_0.1.0_amd64.deb"), "linux-deb");
        assert_eq!(asset_kind("NonTorrent_0.1.0_amd64.AppImage"), "linux-appimage");
        assert_eq!(asset_kind("checksums.txt"), "other");
    }
}

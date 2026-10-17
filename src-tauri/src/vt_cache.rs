//! Дисковый кэш вердиктов VirusTotal — переживает перезапуски приложения.
//!
//! Формат: `app_data/vt_cache.json` → { sha256: {verdict, detections, ts, known} }.
//! TTL: вердикт от движков — 21 день (файлы на VT периодически пересканируются),
//! «отпечаток неизвестен» — 3 дня (новые файлы быстро набирают детекты).
//! Просроченные записи выбрасываются при загрузке и при сохранении.

use std::{collections::HashMap, path::Path};

use serde::{Deserialize, Serialize};

use crate::types::now_ms;

const TTL_KNOWN_MS: i64 = 21 * 24 * 60 * 60 * 1000;
const TTL_UNKNOWN_MS: i64 = 3 * 24 * 60 * 60 * 1000;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VtDiskEntry {
    pub verdict: String,
    pub detections: Vec<String>,
    pub ts: i64,
    /// true — VT встречал файл; false — 404, отпечаток неизвестен
    pub known: bool,
}

impl VtDiskEntry {
    pub fn expired(&self, now: i64) -> bool {
        let ttl = if self.known { TTL_KNOWN_MS } else { TTL_UNKNOWN_MS };
        now.saturating_sub(self.ts) > ttl
    }
}

pub type VtCacheMap = HashMap<String, VtDiskEntry>;

/// Загрузить кэш с диска, выбросив просроченные записи.
pub fn load(path: &Path) -> VtCacheMap {
    let now = now_ms();
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<VtCacheMap>(&s).ok())
        .map(|map| {
            map.into_iter()
                .filter(|(_, e)| !e.expired(now))
                .collect()
        })
        .unwrap_or_default()
}

/// Записать кэш на диск (перезапись целиком — файл небольшой).
pub fn save(path: &Path, map: &VtCacheMap) {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let now = now_ms();
    // сохраняем только живые записи
    let live: VtCacheMap = map
        .iter()
        .filter(|(_, e)| !e.expired(now))
        .map(|(k, e)| (k.clone(), e.clone()))
        .collect();
    if let Ok(json) = serde_json::to_string(&live) {
        let tmp = path.with_extension("json.tmp");
        if std::fs::write(&tmp, json).is_ok() {
            let _ = std::fs::rename(&tmp, path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expiry_by_ttl() {
        let now = now_ms();
        let known = VtDiskEntry {
            verdict: "clean".into(),
            detections: vec![],
            ts: now - TTL_KNOWN_MS - 1000,
            known: true,
        };
        let unknown = VtDiskEntry {
            verdict: "clean".into(),
            detections: vec![],
            ts: now - 2 * 24 * 60 * 60 * 1000,
            known: false,
        };
        assert!(known.expired(now));
        assert!(!unknown.expired(now));
    }
}

//! Планировщик скорости: почасовые лимиты скачивания/отдачи по расписанию.
//!
//! librqbit имеет встроенные рейт-лимиты (session.ratelimits.set_download_bps /
//! set_upload_bps) — их и применяем. Каждые 30 секунд вычисляем актуальные
//! лимиты из настроек и, если они изменились, применяем к сессии.
//!
//! Семантика:
//!   * планировщик выключен → действуют базовые maxDownMbps / maxUpMbps;
//!   * планировщик включён → первое подходящее правило; ни одно не подошло → база;
//!   * окно «22:00–06:00» понимается как через полночь;
//!   * пустое поле лимита = без ограничений, 0 = блокировка (1 байт/с);
//!   * 1 Мбит/с = 125 000 байт/с.

use std::num::NonZeroU32;

use chrono::{Datelike, Local, Timelike};
use tauri::Manager;

use crate::types::SettingsDto;

/// Мбит/с → байт/с. None → None (без ограничений), 0 → Some(1) (блокировка).
fn mbps_to_bps(v: Option<f64>) -> Option<u32> {
    match v {
        None => None,
        Some(mbps) if mbps <= 0.0 => Some(1),
        Some(mbps) => {
            let bps = (mbps * 125_000.0).min(f64::from(u32::MAX) / 2.0);
            Some(bps.max(1.0) as u32)
        }
    }
}

fn parse_hhmm(s: &str) -> Option<u32> {
    let mut it = s.trim().split(':');
    let h: u32 = it.next()?.trim().parse().ok()?;
    let m: u32 = it.next().unwrap_or("0").trim().parse().ok()?;
    if h > 23 || m > 59 {
        return None;
    }
    Some(h * 60 + m)
}

fn in_window(now_min: u32, start: u32, end: u32) -> bool {
    if start == end {
        return true; // «09:00–09:00» — весь день
    }
    if start < end {
        now_min >= start && now_min < end
    } else {
        // через полночь
        now_min >= start || now_min < end
    }
}

fn day_index_mon0(weekday: chrono::Weekday) -> u8 {
    match weekday {
        chrono::Weekday::Mon => 0,
        chrono::Weekday::Tue => 1,
        chrono::Weekday::Wed => 2,
        chrono::Weekday::Thu => 3,
        chrono::Weekday::Fri => 4,
        chrono::Weekday::Sat => 5,
        chrono::Weekday::Sun => 6,
    }
}

/// Актуальные лимиты (байт/с) для текущего момента.
pub fn desired_limits(s: &SettingsDto) -> (Option<u32>, Option<u32>) {
    let base = (
        mbps_to_bps(s.max_down_mbps),
        mbps_to_bps(s.max_up_mbps),
    );

    if !s.scheduler_enabled || s.scheduler_rules.is_empty() {
        return base;
    }

    let now = Local::now();
    let now_min = now.hour() * 60 + now.minute();
    let today = day_index_mon0(now.weekday());

    for rule in &s.scheduler_rules {
        if !rule.days.contains(&today) {
            continue;
        }
        let (Some(start), Some(end)) = (parse_hhmm(&rule.start), parse_hhmm(&rule.end)) else {
            continue;
        };
        if in_window(now_min, start, end) {
            return (mbps_to_bps(rule.down_mbps), mbps_to_bps(rule.up_mbps));
        }
    }
    base
}

/// Фоновая задача: раз в 30 с сверяет лимиты настроек с сессией librqbit.
pub fn spawn(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut tick = tokio::time::interval(std::time::Duration::from_secs(30));
        let mut applied: (Option<u32>, Option<u32>) = (None, None);

        loop {
            tick.tick().await;
            let Ok(session) = crate::engine::get_session(&app).await else {
                continue;
            };
            let settings = {
                let state = app.state::<crate::AppState>();
                state.settings.lock().unwrap().clone()
            };

            let want = desired_limits(&settings);
            if want == applied {
                continue;
            }

            session.ratelimits.set_download_bps(want.0.and_then(NonZeroU32::new));
            session.ratelimits.set_upload_bps(want.1.and_then(NonZeroU32::new));
            tracing::info!(
                "планировщик: скачивание {:?} Б/с, отдача {:?} Б/с",
                want.0,
                want.1
            );
            applied = want;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mbps_conversion() {
        assert_eq!(mbps_to_bps(None), None);
        assert_eq!(mbps_to_bps(Some(0.0)), Some(1));
        assert_eq!(mbps_to_bps(Some(8.0)), Some(1_000_000));
    }

    #[test]
    fn windows() {
        assert!(in_window(10 * 60, 9 * 60, 22 * 60));
        assert!(!in_window(23 * 60, 9 * 60, 22 * 60));
        // через полночь
        assert!(in_window(23 * 60, 22 * 60, 6 * 60));
        assert!(in_window(2 * 60, 22 * 60, 6 * 60));
        assert!(!in_window(12 * 60, 22 * 60, 6 * 60));
    }

    #[test]
    fn hhmm() {
        assert_eq!(parse_hhmm("09:30"), Some(570));
        assert_eq!(parse_hhmm("9"), Some(540));
        assert_eq!(parse_hhmm("24:00"), None);
    }
}

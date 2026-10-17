//! Системный трей: показ/скрытие окна, пауза/продолжение всех раздач, выход.
//!
//! Клик левой кнопкой — показать окно, меню — правой (обычное поведение
//! десктопных программ). Закрытие окна не завершает приложение, если в
//! настройках включено «сворачивать в трей» (см. on_window_event в lib.rs).

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub fn build(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "Открыть NonTorrent", true, None::<&str>)?;
    let pause_all = MenuItem::with_id(app, "pause_all", "Пауза всех раздач", true, None::<&str>)?;
    let resume_all =
        MenuItem::with_id(app, "resume_all", "Продолжить все раздачи", true, None::<&str>)?;
    let sep = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &sep, &pause_all, &resume_all, &sep, &quit])?;

    let mut tray = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("NonTorrent")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_window(app),
            "pause_all" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = crate::engine::set_all_paused(&app, true).await {
                        tracing::warn!("пауза всех: {e}");
                    }
                });
            }
            "resume_all" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = crate::engine::set_all_paused(&app, false).await {
                        tracing::warn!("продолжить все: {e}");
                    }
                });
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.build(app)?;
    Ok(())
}

fn show_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

// Native shell only — Memoire keeps all business logic in the NestJS API and
// Next.js frontend (§36 desktop plan: Tauri -> Next.js -> same API). This
// binary's job is packaging, window chrome, and checking for app updates.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            #[cfg(not(debug_assertions))]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    check_for_update(handle).await;
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running memoire desktop shell");
}

#[cfg(not(debug_assertions))]
async fn check_for_update(app: tauri::AppHandle) {
    use tauri_plugin_updater::UpdaterExt;

    let Ok(updater) = app.updater() else { return };
    match updater.check().await {
        Ok(Some(update)) => {
            let _ = update
                .download_and_install(|_chunk, _total| {}, || {})
                .await;
        }
        Ok(None) => {}
        Err(err) => eprintln!("update check failed: {err}"),
    }
}

// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
//! LT4-Docs Client: Tauri-Befehle für den verschlüsselten lokalen Speicher,
//! den Datei-Export und das Öffnen eines Servers im eigenen Fenster.

mod vault;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use vault::*;
use zeroize::Zeroize;

#[derive(Default)]
struct AppState {
    key: Mutex<Option<[u8; 32]>>,
}

fn vault_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("vault"))
}

fn current_key(state: &State<AppState>) -> Result<[u8; 32], String> {
    state
        .key
        .lock()
        .map_err(|_| "Interner Fehler".to_string())?
        .ok_or_else(|| "Gesperrt".to_string())
}

fn set_key(state: &State<AppState>, key: Option<[u8; 32]>) {
    if let Ok(mut guard) = state.key.lock() {
        if let Some(old) = guard.as_mut() {
            old.zeroize();
        }
        *guard = key;
    }
}

fn status_of(dir: &PathBuf, state: &State<AppState>) -> VaultStatus {
    let unlocked = state.key.lock().map(|k| k.is_some()).unwrap_or(false);
    match read_vault(dir) {
        None => VaultStatus {
            initialized: false,
            unlocked: false,
            kind: KIND_NONE.into(),
            failed: 0,
            wait_seconds: 0,
            unprotected: false,
        },
        Some(v) => VaultStatus {
            initialized: true,
            unlocked,
            kind: v.lock.kind.clone(),
            failed: v.failed,
            wait_seconds: v.locked_until.saturating_sub(now()),
            unprotected: v.lock.kind == KIND_NONE && !v.keyring,
        },
    }
}

#[tauri::command]
fn vault_status(app: AppHandle, state: State<AppState>) -> Result<VaultStatus, String> {
    let dir = vault_dir(&app)?;
    Ok(status_of(&dir, &state))
}

#[tauri::command]
fn vault_create(
    app: AppHandle,
    state: State<AppState>,
    kind: String,
    secret: Option<String>,
) -> Result<VaultStatus, String> {
    let dir = vault_dir(&app)?;
    if read_vault(&dir).is_some() {
        return Err("Es gibt schon einen lokalen Speicher.".into());
    }
    let master = random_key();
    let mut v = VaultFile {
        version: 1,
        ..Default::default()
    };
    build_lock(&master, &kind, secret.as_deref().unwrap_or(""), &mut v)?;
    write_vault(&dir, &v)?;
    set_key(&state, Some(master));
    Ok(status_of(&dir, &state))
}

#[tauri::command]
fn vault_unlock(
    app: AppHandle,
    state: State<AppState>,
    secret: Option<String>,
) -> Result<VaultStatus, String> {
    let dir = vault_dir(&app)?;
    let mut v = read_vault(&dir).ok_or_else(|| "Kein lokaler Speicher vorhanden.".to_string())?;
    if v.lock.kind == KIND_NONE {
        let key = open_without_code(&v)?;
        set_key(&state, Some(key));
        return Ok(status_of(&dir, &state));
    }
    let wait = v.locked_until.saturating_sub(now());
    if wait > 0 {
        return Err(format!("Zu viele Fehlversuche. Bitte {} s warten.", wait));
    }
    match unwrap_key(&v.lock, secret.as_deref().unwrap_or("")) {
        Ok(key) => {
            v.failed = 0;
            v.locked_until = 0;
            write_vault(&dir, &v)?;
            set_key(&state, Some(key));
            Ok(status_of(&dir, &state))
        }
        Err(_) => {
            v.failed += 1;
            let w = wait_for(v.failed);
            v.locked_until = if w > 0 { now() + w } else { 0 };
            write_vault(&dir, &v)?;
            if w > 0 {
                Err(format!("Falscher Code. Nächster Versuch in {} s.", w))
            } else {
                Err("Falscher Code.".into())
            }
        }
    }
}

#[tauri::command]
fn vault_lock(app: AppHandle, state: State<AppState>) -> Result<VaultStatus, String> {
    set_key(&state, None);
    let dir = vault_dir(&app)?;
    Ok(status_of(&dir, &state))
}

#[tauri::command]
fn vault_change_lock(
    app: AppHandle,
    state: State<AppState>,
    kind: String,
    secret: Option<String>,
) -> Result<VaultStatus, String> {
    let dir = vault_dir(&app)?;
    let master = current_key(&state)?;
    let mut v = read_vault(&dir).ok_or_else(|| "Kein lokaler Speicher vorhanden.".to_string())?;
    build_lock(&master, &kind, secret.as_deref().unwrap_or(""), &mut v)?;
    write_vault(&dir, &v)?;
    Ok(status_of(&dir, &state))
}

/// Löscht alle lokalen Daten (z. B. Code vergessen). Nicht rückgängig zu machen.
#[tauri::command]
fn vault_reset(app: AppHandle, state: State<AppState>) -> Result<VaultStatus, String> {
    let dir = vault_dir(&app)?;
    set_key(&state, None);
    keyring_delete();
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(status_of(&dir, &state))
}

#[tauri::command]
fn data_read(app: AppHandle, state: State<AppState>, name: String) -> Result<Option<String>, String> {
    let key = current_key(&state)?;
    let path = vault_dir(&app)?.join("data").join(format!("{}.bin", safe_name(&name)?));
    if !path.exists() {
        return Ok(None);
    }
    let blob = fs::read(path).map_err(|e| e.to_string())?;
    let plain = decrypt(&key, &blob)?;
    String::from_utf8(plain).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn data_write(app: AppHandle, state: State<AppState>, name: String, content: String) -> Result<(), String> {
    let key = current_key(&state)?;
    let path = vault_dir(&app)?.join("data").join(format!("{}.bin", safe_name(&name)?));
    atomic_write(&path, &encrypt(&key, content.as_bytes())?)
}

#[tauri::command]
fn data_delete(app: AppHandle, state: State<AppState>, name: String) -> Result<(), String> {
    current_key(&state)?;
    let path = vault_dir(&app)?.join("data").join(format!("{}.bin", safe_name(&name)?));
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn file_write(app: AppHandle, state: State<AppState>, id: String, base64: String) -> Result<(), String> {
    let key = current_key(&state)?;
    let bytes = B64.decode(base64).map_err(|e| e.to_string())?;
    let path = vault_dir(&app)?.join("files").join(format!("{}.bin", safe_name(&id)?));
    atomic_write(&path, &encrypt(&key, &bytes)?)
}

#[tauri::command]
fn file_read(app: AppHandle, state: State<AppState>, id: String) -> Result<Option<String>, String> {
    let key = current_key(&state)?;
    let path = vault_dir(&app)?.join("files").join(format!("{}.bin", safe_name(&id)?));
    if !path.exists() {
        return Ok(None);
    }
    let blob = fs::read(path).map_err(|e| e.to_string())?;
    Ok(Some(B64.encode(decrypt(&key, &blob)?)))
}

#[tauri::command]
fn file_delete(app: AppHandle, state: State<AppState>, id: String) -> Result<(), String> {
    current_key(&state)?;
    let path = vault_dir(&app)?.join("files").join(format!("{}.bin", safe_name(&id)?));
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Schreibt eine Export-Datei an den im Speichern-Dialog gewählten Ort (unverschlüsselt).
#[tauri::command]
fn export_write(state: State<AppState>, path: String, base64: String) -> Result<(), String> {
    current_key(&state)?;
    let bytes = B64.decode(base64).map_err(|e| e.to_string())?;
    fs::write(PathBuf::from(path), bytes).map_err(|e| e.to_string())
}

/// Liest eine vom Nutzer gewählte Datei (z. B. .lt4docs zum Einlesen).
#[tauri::command]
fn import_read(state: State<AppState>, path: String) -> Result<String, String> {
    current_key(&state)?;
    let bytes = fs::read(PathBuf::from(path)).map_err(|e| e.to_string())?;
    Ok(B64.encode(bytes))
}

/// Öffnet einen LT4-Server in einem eigenen Fenster. Fremde Seiten bekommen
/// keinen Zugriff auf die Befehle oben (Rechte gelten nur für das Hauptfenster).
#[tauri::command]
async fn open_server_window(app: AppHandle, url: String, title: String) -> Result<(), String> {
    let parsed: tauri::Url = url.parse().map_err(|_| "Ungültige Adresse".to_string())?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err("Nur http(s)-Adressen sind erlaubt.".into());
    }
    let host = parsed.host_str().unwrap_or("server");
    let label: String = format!("server-{}", host)
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' })
        .collect();
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, label, WebviewUrl::External(parsed))
        .title(format!("LT4-Docs – {}", title))
        .inner_size(1280.0, 860.0)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            vault_status,
            vault_create,
            vault_unlock,
            vault_lock,
            vault_change_lock,
            vault_reset,
            data_read,
            data_write,
            data_delete,
            file_write,
            file_read,
            file_delete,
            export_write,
            import_read,
            open_server_window
        ])
        .run(tauri::generate_context!())
        .expect("LT4-Docs konnte nicht gestartet werden");
}

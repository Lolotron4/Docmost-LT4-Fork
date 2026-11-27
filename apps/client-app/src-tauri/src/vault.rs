// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
//! Verschlüsselter lokaler Speicher ("Tresor") des LT4-Docs Clients.
//!
//! - Ein zufälliger 32-Byte-Hauptschlüssel verschlüsselt alle Daten (XChaCha20-Poly1305).
//! - Mit App-Sperre (PIN, Passwort, Muster) wird der Hauptschlüssel mit einem aus dem
//!   Code abgeleiteten Schlüssel (Argon2id) verpackt. Ohne Sperre liegt er im
//!   Schlüsselbund des Systems (Fallback: in vault.json, dann ungeschützt).
//! - Fehlversuche führen zu steigenden Wartezeiten.

use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use zeroize::Zeroize;

pub const KIND_NONE: &str = "none";
const KINDS: [&str; 4] = ["none", "pin", "password", "pattern"];
const FREE_ATTEMPTS: u32 = 5;

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct LockInfo {
    pub kind: String,
    #[serde(default)]
    pub salt: String,
    #[serde(default)]
    pub wrapped: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct VaultFile {
    pub version: u32,
    pub lock: LockInfo,
    /// Nur ohne Sperre: Hauptschlüssel liegt im Schlüsselbund.
    #[serde(default)]
    pub keyring: bool,
    /// Nur ohne Sperre und ohne Schlüsselbund: Hauptschlüssel im Klartext (ungeschützt).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plain_key: Option<String>,
    #[serde(default)]
    pub failed: u32,
    #[serde(default)]
    pub locked_until: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub initialized: bool,
    pub unlocked: bool,
    pub kind: String,
    pub failed: u32,
    pub wait_seconds: u64,
    /// true, wenn ohne Sperre und ohne Schlüsselbund gespeichert wird.
    pub unprotected: bool,
}

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn validate_secret(kind: &str, secret: &str) -> Result<(), String> {
    match kind {
        "none" => Ok(()),
        "pin" => {
            if secret.len() >= 6 && secret.chars().all(|c| c.is_ascii_digit()) {
                Ok(())
            } else {
                Err("Die PIN muss mindestens 6 Ziffern haben.".into())
            }
        }
        "password" => {
            if secret.chars().count() >= 8 {
                Ok(())
            } else {
                Err("Das Passwort muss mindestens 8 Zeichen haben.".into())
            }
        }
        "pattern" => {
            let points: Vec<&str> = secret.split('-').collect();
            let valid = points
                .iter()
                .all(|p| p.len() == 1 && p.chars().all(|c| ('0'..='8').contains(&c)));
            let mut uniq = points.clone();
            uniq.sort();
            uniq.dedup();
            if valid && points.len() >= 4 && uniq.len() == points.len() {
                Ok(())
            } else {
                Err("Das Muster muss mindestens 4 Punkte verbinden.".into())
            }
        }
        _ => Err("Unbekannte Sperr-Art.".into()),
    }
}

pub fn is_valid_kind(kind: &str) -> bool {
    KINDS.contains(&kind)
}

/// Wartezeit nach `failed` Fehlversuchen: 30 s, 60 s, 120 s ... höchstens 1 Stunde.
pub fn wait_for(failed: u32) -> u64 {
    if failed < FREE_ATTEMPTS {
        return 0;
    }
    let exp = (failed - FREE_ATTEMPTS).min(7);
    (30u64 << exp).min(3600)
}

fn derive_key(secret: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let params = Params::new(64 * 1024, 3, 1, Some(32)).map_err(|e| e.to_string())?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut out = [0u8; 32];
    argon
        .hash_password_into(secret.as_bytes(), salt, &mut out)
        .map_err(|e| e.to_string())?;
    Ok(out)
}

pub fn encrypt(key: &[u8; 32], plain: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = XChaCha20Poly1305::new(key.into());
    let mut nonce = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut nonce);
    let ct = cipher
        .encrypt(XNonce::from_slice(&nonce), plain)
        .map_err(|_| "Verschlüsseln fehlgeschlagen".to_string())?;
    let mut out = nonce.to_vec();
    out.extend_from_slice(&ct);
    Ok(out)
}

pub fn decrypt(key: &[u8; 32], blob: &[u8]) -> Result<Vec<u8>, String> {
    if blob.len() < 24 + 16 {
        return Err("Beschädigte Daten".into());
    }
    let cipher = XChaCha20Poly1305::new(key.into());
    cipher
        .decrypt(XNonce::from_slice(&blob[..24]), &blob[24..])
        .map_err(|_| "Entschlüsseln fehlgeschlagen".to_string())
}

pub fn random_key() -> [u8; 32] {
    let mut k = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut k);
    k
}

/// Verpackt den Hauptschlüssel mit einem Code. Gibt (salt, wrapped) als Base64 zurück.
pub fn wrap_key(master: &[u8; 32], secret: &str) -> Result<(String, String), String> {
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    let mut kek = derive_key(secret, &salt)?;
    let wrapped = encrypt(&kek, master);
    kek.zeroize();
    Ok((B64.encode(salt), B64.encode(wrapped?)))
}

pub fn unwrap_key(lock: &LockInfo, secret: &str) -> Result<[u8; 32], String> {
    let salt = B64.decode(&lock.salt).map_err(|e| e.to_string())?;
    let wrapped = B64.decode(&lock.wrapped).map_err(|e| e.to_string())?;
    let mut kek = derive_key(secret, &salt)?;
    let res = decrypt(&kek, &wrapped);
    kek.zeroize();
    let mut plain = res.map_err(|_| "Falscher Code.".to_string())?;
    if plain.len() != 32 {
        plain.zeroize();
        return Err("Beschädigter Schlüssel".into());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&plain);
    plain.zeroize();
    Ok(key)
}

// ---------- Schlüsselbund ----------

#[cfg(not(target_os = "android"))]
fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new("de.lolotron4.lt4docs", "vault-key").map_err(|e| e.to_string())
}

#[cfg(not(target_os = "android"))]
pub fn keyring_store(key: &[u8; 32]) -> bool {
    match keyring_entry() {
        Ok(e) => e.set_password(&B64.encode(key)).is_ok() && keyring_load().is_some(),
        Err(_) => false,
    }
}

#[cfg(not(target_os = "android"))]
pub fn keyring_load() -> Option<[u8; 32]> {
    let e = keyring_entry().ok()?;
    let s = e.get_password().ok()?;
    let v = B64.decode(s).ok()?;
    if v.len() != 32 {
        return None;
    }
    let mut k = [0u8; 32];
    k.copy_from_slice(&v);
    Some(k)
}

#[cfg(not(target_os = "android"))]
pub fn keyring_delete() {
    if let Ok(e) = keyring_entry() {
        let _ = e.delete_credential();
    }
}

#[cfg(target_os = "android")]
pub fn keyring_store(_key: &[u8; 32]) -> bool {
    false
}
#[cfg(target_os = "android")]
pub fn keyring_load() -> Option<[u8; 32]> {
    None
}
#[cfg(target_os = "android")]
pub fn keyring_delete() {}

// ---------- Dateien ----------

pub fn vault_path(dir: &Path) -> PathBuf {
    dir.join("vault.json")
}

pub fn read_vault(dir: &Path) -> Option<VaultFile> {
    let raw = fs::read_to_string(vault_path(dir)).ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn write_vault(dir: &Path, v: &VaultFile) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(v).map_err(|e| e.to_string())?;
    atomic_write(&vault_path(dir), json.as_bytes())
}

pub fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// Erlaubt nur einfache Namen (keine Pfade), damit nichts außerhalb des Tresors landet.
pub fn safe_name(name: &str) -> Result<&str, String> {
    let ok = !name.is_empty()
        && name.len() <= 128
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
        && !name.starts_with('.');
    if ok {
        Ok(name)
    } else {
        Err("Ungültiger Name".into())
    }
}

/// Erstellt die Sperr-Daten für eine neue Sperr-Art und speichert ggf. im Schlüsselbund.
pub fn build_lock(master: &[u8; 32], kind: &str, secret: &str, v: &mut VaultFile) -> Result<(), String> {
    if !is_valid_kind(kind) {
        return Err("Unbekannte Sperr-Art.".into());
    }
    validate_secret(kind, secret)?;
    v.plain_key = None;
    v.keyring = false;
    if kind == KIND_NONE {
        v.lock = LockInfo {
            kind: KIND_NONE.into(),
            ..Default::default()
        };
        if keyring_store(master) {
            v.keyring = true;
        } else {
            v.plain_key = Some(B64.encode(master));
        }
    } else {
        let (salt, wrapped) = wrap_key(master, secret)?;
        v.lock = LockInfo {
            kind: kind.into(),
            salt,
            wrapped,
        };
        keyring_delete();
    }
    v.failed = 0;
    v.locked_until = 0;
    Ok(())
}

/// Öffnet ohne Code (nur Sperr-Art "none").
pub fn open_without_code(v: &VaultFile) -> Result<[u8; 32], String> {
    if v.keyring {
        if let Some(k) = keyring_load() {
            return Ok(k);
        }
        return Err("Schlüssel im Schlüsselbund nicht gefunden.".into());
    }
    let s = v
        .plain_key
        .as_ref()
        .ok_or_else(|| "Kein Schlüssel gespeichert.".to_string())?;
    let raw = B64.decode(s).map_err(|e| e.to_string())?;
    if raw.len() != 32 {
        return Err("Beschädigter Schlüssel".into());
    }
    let mut k = [0u8; 32];
    k.copy_from_slice(&raw);
    Ok(k)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_encrypt() {
        let k = random_key();
        let blob = encrypt(&k, b"hallo").unwrap();
        assert_eq!(decrypt(&k, &blob).unwrap(), b"hallo");
        let other = random_key();
        assert!(decrypt(&other, &blob).is_err());
    }

    #[test]
    fn wrap_unwrap() {
        let k = random_key();
        let (salt, wrapped) = wrap_key(&k, "123456").unwrap();
        let lock = LockInfo { kind: "pin".into(), salt, wrapped };
        assert_eq!(unwrap_key(&lock, "123456").unwrap(), k);
        assert!(unwrap_key(&lock, "654321").is_err());
    }

    #[test]
    fn secrets() {
        assert!(validate_secret("pin", "12345").is_err());
        assert!(validate_secret("pin", "12345a").is_err());
        assert!(validate_secret("pin", "123456").is_ok());
        assert!(validate_secret("password", "kurz").is_err());
        assert!(validate_secret("password", "langesPasswort").is_ok());
        assert!(validate_secret("pattern", "0-1-2").is_err());
        assert!(validate_secret("pattern", "0-1-1-2").is_err());
        assert!(validate_secret("pattern", "0-1-2-5").is_ok());
        assert!(validate_secret("pattern", "0-1-2-9").is_err());
    }

    #[test]
    fn waits() {
        assert_eq!(wait_for(4), 0);
        assert_eq!(wait_for(5), 30);
        assert_eq!(wait_for(6), 60);
        assert_eq!(wait_for(50), 3600);
    }

    #[test]
    fn names() {
        assert!(safe_name("state").is_ok());
        assert!(safe_name("page-0193").is_ok());
        assert!(safe_name("../x").is_err());
        assert!(safe_name(".hidden").is_err());
        assert!(safe_name("a/b").is_err());
    }
}

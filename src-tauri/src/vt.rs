//! Встроенный ключ VirusTotal.
//!
//! Токен не хранится в открытом виде в бинарнике: он XOR-обфусцирован
//! с циклическим ключом и разбит на три константы, которые физически
//! лежат в разных участках кода. Восстанавливается только в памяти
//! на момент запроса.
//!
//! Приоритет источников ключа:
//!   1. свой ключ из настроек приложения (settings.vtApiKey);
//!   2. переменная окружения NT_VT_API_TOKEN;
//!   3. встроенный (обфусцированный) ключ, если включён в настройках.
//!
//! Обфускация защищает от тривиального `strings ./nontorrent.exe`,
//! но не от реверс-инжиниринга. Для полной приватности используйте
//! собственный ключ или переменную окружения.

pub const CHUNK_A: &[u8] = b"\x2f\x5d\x57\x67\x59\x16\x46\x03\x08\x41\x02\x58\x67\x55\x53\x06\x16\x1d\x5e\x0b\x0a\x01";
pub const CHUNK_B: &[u8] = b"\x51\x57\x2a\x5b\x56\x64\x5a\x46\x11\x51\x0a\x16\x0c\x08\x67\x50\x5f\x01\x10\x41\x59\x5e";
pub const CHUNK_C: &[u8] = b"\x07\x06\x04\x55\x78\x5a\x59\x36\x5a\x14\x46\x50\x5e\x44\x0f\x5b\x62\x02\x00\x00";

// Ключ XOR собирается из трёх частей, чтобы не лежал в бинарнике одним куском.
pub const KEY_A: &str = "NonTorrent";
pub const KEY_B: &str = "::Safety";
pub const KEY_C: &str = "::2026";

pub const ENV_OVERRIDE: &str = "NT_VT_API_TOKEN";

fn xor_key() -> Vec<u8> {
    let mut k = Vec::with_capacity(KEY_A.len() + KEY_B.len() + KEY_C.len());
    k.extend_from_slice(KEY_A.as_bytes());
    k.extend_from_slice(KEY_B.as_bytes());
    k.extend_from_slice(KEY_C.as_bytes());
    k
}

/// Восстановить встроенный токен в памяти.
pub fn builtin_key() -> Option<String> {
    let key = xor_key();
    let mut out = Vec::with_capacity(CHUNK_A.len() + CHUNK_B.len() + CHUNK_C.len());
    out.extend_from_slice(CHUNK_A);
    out.extend_from_slice(CHUNK_B);
    out.extend_from_slice(CHUNK_C);
    let decoded: Vec<u8> = out
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect();
    String::from_utf8(decoded).ok()
}

/// Итоговый ключ с учётом настроек и окружения.
pub fn effective_key(user_key: &str, use_builtin: bool) -> Option<String> {
    if !user_key.trim().is_empty() {
        return Some(user_key.trim().to_string());
    }
    if let Ok(env_key) = std::env::var(ENV_OVERRIDE) {
        if !env_key.trim().is_empty() {
            return Some(env_key.trim().to_string());
        }
    }
    if use_builtin {
        return builtin_key();
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_token_shape() {
        let t = builtin_key().expect("токен должен восстанавливаться");
        assert_eq!(t.len(), 64);
        assert!(t.chars().all(|c| c.is_ascii_hexdigit()));
    }
}

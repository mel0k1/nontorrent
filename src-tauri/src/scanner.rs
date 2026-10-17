use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{
    io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt},
    sync::mpsc::UnboundedReceiver,
};

use crate::{settings, types::*, vt_cache, yara};

const MAX_FILES_PER_JOB: usize = 512;
// Строка EICAR — стандартный тестовый образец для проверки антивирусных движков
const EICAR: &str = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const RISKY_EXTS: &[&str] = &[
    "exe", "msi", "com", "scr", "bat", "cmd", "ps1", "vbs", "js", "jar", "lnk", "dll", "sys",
    "pif", "hta", "cpl", "msc", "reg", "apk",
];
const EXE_LIKE: &[&str] = &["exe", "msi", "com", "scr", "dll", "sys", "pif", "hta", "cpl", "msc"];

#[derive(Clone, Debug)]
pub struct ScanJob {
    pub torrent_id: Option<u32>,
    pub path: PathBuf,
    pub torrent_name: Option<String>,
    pub reason: &'static str,
}

/// Воркер сканера: тянет задания из канала и публикует отчёты в журнал + на фронт
pub fn spawn_worker(mut rx: UnboundedReceiver<ScanJob>, app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        while let Some(job) = rx.recv().await {
            tracing::debug!(reason = job.reason, "scan job: {}", job.path.display());
            let results = run_job(&app, &job).await;
            for report in results {
                publish(&app, job.torrent_id, report).await;
            }
        }
    });
}

async fn run_job(app: &AppHandle, job: &ScanJob) -> Vec<ScanReportDto> {
    let mut out = Vec::new();
    let Ok(meta) = tokio::fs::metadata(&job.path).await else {
        return out;
    };
    if meta.is_dir() {
        let mut files: Vec<PathBuf> = walkdir::WalkDir::new(&job.path)
            .max_depth(8)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .map(|e| e.into_path())
            .take(MAX_FILES_PER_JOB)
            .collect();
        files.sort();
        for f in files {
            if let Some(r) = scan_file(app, &f, job).await {
                out.push(r);
            }
        }
    } else if let Some(r) = scan_file(app, &job.path, job).await {
        out.push(r);
    }
    out
}

async fn scan_file(app: &AppHandle, path: &Path, job: &ScanJob) -> Option<ScanReportDto> {
    let state = app.state::<crate::AppState>();
    // короткий лок: копия настроек, чтобы не держать Mutex через await
    let app_settings = state.settings.lock().unwrap().clone();

    let meta = tokio::fs::metadata(path).await.ok()?;
    let size = meta.len();
    let name = path.file_name()?.to_string_lossy().to_string();
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();

    let mut detections: Vec<String> = Vec::new();
    let mut engines: Vec<String> = vec!["Хэш".into(), "Эвристика".into()];
    let mut malicious = false;

    let sha_raw = hash_file(path).await.ok();
    let sha_hex = sha_raw.as_ref().map(hex::encode);

    let head = read_range(path, 0, 65536).await.unwrap_or_default();
    let tail = if size > 65536 {
        read_range(path, size - 4096, 4096).await.unwrap_or_default()
    } else {
        Vec::new()
    };

    // 1. Тестовая сигнатура EICAR
    if contains(&head, EICAR.as_bytes()) || contains(&tail, EICAR.as_bytes()) {
        detections.push("EICAR-Test-File: тестовая сигнатура антивируса".into());
        malicious = true;
    }

    // 2. PE/MZ-заголовок в «неисполняемом» файле — маскировка
    if head.starts_with(b"MZ") && !EXE_LIKE.contains(&ext.as_str()) {
        detections.push(format!("PE/MZ-сигнатура внутри файла .{ext} — маскировка"));
    }

    // 3. Рискованные форматы
    let risky = RISKY_EXTS.contains(&ext.as_str());
    if risky {
        detections.push(format!("Исполняемый формат .{ext} — требует внимания"));
    }

    // 4. Двойное расширение
    if ext == "exe" && name.to_lowercase().matches('.').count() > 1 {
        detections.push("Двойное расширение — маскировка под безопасный файл".into());
    }

    // 5. Энтропия: упаковщик/шифрование
    if risky && size > 4096 {
        if let Some(e) = sample_entropy(path, size).await {
            if e > 7.9 {
                detections.push(format!("Энтропия {e:.2} — признаки упаковщика"));
            }
        }
    }

    let suspicious = !detections.is_empty();

    // 6. YARA — локальные сигнатуры (встроенные + пользовательские правила).
    // Большие файлы (видео, образы) сканируем только при подозрении.
    if app_settings.yara_enabled {
        if let Some(engine) = state.yara.lock().unwrap().as_ref() {
            let big = size > yara::YARA_ALWAYS_LIMIT;
            let interesting = risky || head.starts_with(b"MZ") || (ext == "lnk");
            if !big || interesting {
                if let Some(found) = engine.scan_file(path) {
                    if !found.rules.is_empty() {
                        engines.push("YARA".into());
                        detections.extend(found.detections);
                        if found.malicious {
                            malicious = true;
                        }
                    }
                }
            }
        }
    }

    // 7. clamd (ClamAV) — локальная сигнатурная проверка
    if !app_settings.clamd_address.is_empty() && (suspicious || size <= 10 * 1024 * 1024) {
        match clamd_scan(&app_settings.clamd_address, path).await {
            Ok(Some(sig)) => {
                detections.push(sig);
                malicious = true;
                engines.push("clamd".into());
            }
            Ok(None) => engines.push("clamd".into()),
            Err(e) => tracing::debug!("{e}"),
        }
    }

    // 8. VirusTotal — по отпечатку, без загрузки файла.
    // Ключ: свой из настроек → NT_VT_API_TOKEN → встроенный обфусцированный.
    // Вердикты кэшируются на диск и переживают перезапуски (см. vt_cache.rs).
    if let Some(key) =
        crate::vt::effective_key(&app_settings.vt_api_key, app_settings.use_builtin_vt)
    {
        if let Some(sha) = &sha_hex {
            if suspicious || size <= 50 * 1024 * 1024 {
                if let Some((verdict, dets)) = vt_lookup(app, &key, sha).await {
                    engines.push("VirusTotal".into());
                    if !dets.is_empty() {
                        detections.extend(dets);
                    }
                    if verdict == "malicious" {
                        malicious = true;
                    }
                }
            }
        }
    }

    let verdict = if malicious {
        "malicious"
    } else if suspicious {
        "suspicious"
    } else {
        "clean"
    };

    Some(ScanReportDto {
        id: next_scan_id(),
        file: path.to_string_lossy().to_string(),
        torrent_name: job.torrent_name.clone(),
        size_bytes: size,
        sha256: sha_hex,
        verdict: verdict.into(),
        detections,
        engines,
        scanned_at: now_ms(),
        quarantined: false,
    })
}

async fn publish(app: &AppHandle, torrent_id: Option<u32>, mut report: ScanReportDto) {
    let state = app.state::<crate::AppState>();

    if report.verdict == "malicious" && state.settings.lock().unwrap().quarantine_threats {
        match settings::quarantine_file(app, Path::new(&report.file), report.sha256.as_deref()) {
            Ok(_) => report.quarantined = true,
            Err(e) => tracing::warn!("карантин не удался: {e}"),
        }
    }

    if let Some(tid) = torrent_id {
        let mut map = state.scan_states.lock().unwrap();
        let entry = map.entry(tid).or_insert_with(|| ScanStateDto {
            verdict: "pending".into(),
            threats_found: 0,
            scanned_files: 0,
            total_files: 0,
            last_scan_at: None,
        });
        entry.verdict = worst_verdict(&entry.verdict, &report.verdict);
        if report.verdict == "malicious" {
            entry.threats_found += 1;
        }
        entry.scanned_files += 1;
        entry.last_scan_at = Some(now_ms());
    }

    {
        let mut scans = state.scans.lock().unwrap();
        scans.insert(0, report.clone());
        scans.truncate(500);
    }

    let _ = app.emit("scan://completed", &report);
    if report.verdict == "malicious" {
        tracing::warn!("угроза: {}", report.file);
    }
}

// ---------- вспомогательные процедуры ----------

async fn hash_file(path: &Path) -> Result<[u8; 32], String> {
    let mut f = tokio::fs::File::open(path).await.map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 65536];
    loop {
        let n = f.read(&mut buf).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let out: [u8; 32] = hasher.finalize().as_slice().try_into().unwrap_or_default();
    Ok(out)
}

async fn read_range(path: &Path, offset: u64, len: usize) -> Result<Vec<u8>, String> {
    let mut f = tokio::fs::File::open(path).await.map_err(|e| e.to_string())?;
    f.seek(std::io::SeekFrom::Start(offset))
        .await
        .map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; len];
    let mut total = 0usize;
    while total < len {
        let n = f.read(&mut buf[total..]).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        total += n;
    }
    buf.truncate(total);
    Ok(buf)
}

async fn sample_entropy(path: &Path, size: u64) -> Option<f64> {
    let offsets = [0u64, size / 2, size.saturating_sub(8192)];
    let mut freq = [0usize; 256];
    let mut total = 0usize;
    for off in offsets {
        let chunk = read_range(path, off, 8192).await.ok()?;
        for &b in &chunk {
            freq[b as usize] += 1;
        }
        total += chunk.len();
    }
    if total == 0 {
        return None;
    }
    let mut e = 0.0f64;
    for &c in &freq {
        if c == 0 {
            continue;
        }
        let p = c as f64 / total as f64;
        e -= p * p.log2();
    }
    Some(e)
}

fn contains(hay: &[u8], needle: &[u8]) -> bool {
    !needle.is_empty() && hay.len() >= needle.len() && hay.windows(needle.len()).any(|w| w == needle)
}

// ---------- clamd (протокол INSTREAM) ----------

async fn clamd_scan(addr: &str, path: &Path) -> Result<Option<String>, String> {
    let mut stream = tokio::net::TcpStream::connect(addr)
        .await
        .map_err(|e| format!("clamd недоступен: {e}"))?;
    stream
        .write_all(b"zINSTREAM\0")
        .await
        .map_err(|e| e.to_string())?;

    let mut f = tokio::fs::File::open(path).await.map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; 8192];
    loop {
        let n = f.read(&mut buf).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        stream
            .write_all(&(n as u32).to_be_bytes())
            .await
            .map_err(|e| e.to_string())?;
        stream
            .write_all(&buf[..n])
            .await
            .map_err(|e| e.to_string())?;
    }
    stream
        .write_all(&0u32.to_be_bytes())
        .await
        .map_err(|e| e.to_string())?;
    stream.shutdown().await.ok();

    let mut resp = String::new();
    stream
        .read_to_string(&mut resp)
        .await
        .map_err(|e| e.to_string())?;
    let resp = resp.trim().to_string();

    if resp.contains("FOUND") {
        Ok(Some(format!("clamd: {resp}")))
    } else {
        Ok(None)
    }
}

// ---------- VirusTotal v3 ----------

async fn vt_lookup(
    app: &AppHandle,
    key: &str,
    sha: &str,
) -> Option<(String, Vec<String>)> {
    let state = app.state::<crate::AppState>();

    // дисковый кэш уже загружен в память при старте — ищем с учётом TTL
    {
        let now = now_ms();
        let mut cache = state.vt_cache.lock().unwrap();
        match cache.get(sha) {
            Some(entry) if !entry.expired(now) => {
                return Some((entry.verdict.clone(), entry.detections.clone()));
            }
            Some(_) => {
                cache.remove(sha); // просрочено — перепроверим по сети
            }
            None => {}
        }
    }

    // бесплатный тариф: не чаще ~4 запросов в минуту
    {
        let last = *state.vt_last.lock().unwrap();
        if let Some(t) = last {
            let wait = Duration::from_secs(16).saturating_sub(t.elapsed());
            if wait > Duration::ZERO {
                tokio::time::sleep(wait).await;
            }
        }
    }
    *state.vt_last.lock().unwrap() = Some(Instant::now());

    let url = format!("https://www.virustotal.com/api/v3/files/{sha}");
    let resp = reqwest::Client::new()
        .get(&url)
        .header("x-apikey", key)
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .ok()?;

    // (вердикт, детекты, known: встречал ли VT файл — влияет на TTL кэша)
    let result: Option<(String, Vec<String>, bool)> = if resp.status().as_u16() == 404 {
        // отпечаток неизвестен движкам — считаем чистым, но недолго (новые файлы быстро набирают детекты)
        Some(("clean".to_string(), Vec::new(), false))
    } else if !resp.status().is_success() {
        None
    } else {
        let j: serde_json::Value = resp.json().await.ok()?;
        let stats = &j["data"]["attributes"]["last_analysis_stats"];
        let mal = stats["malicious"].as_u64().unwrap_or(0);
        let sus = stats["suspicious"].as_u64().unwrap_or(0);
        let und = stats["undetected"].as_u64().unwrap_or(0);
        let har = stats["harmless"].as_u64().unwrap_or(0);
        let total = mal + sus + und + har;
        if mal > 0 || sus > 0 {
            Some((
                "malicious".to_string(),
                vec![format!(
                    "VirusTotal: {mal} malicious / {sus} suspicious из {total} движков"
                )],
                true,
            ))
        } else if und + har > 0 {
            Some(("clean".to_string(), Vec::new(), true))
        } else {
            Some(("clean".to_string(), Vec::new(), false))
        }
    };

    if let Some((verdict, dets, known)) = &result {
        {
            let mut cache = state.vt_cache.lock().unwrap();
            cache.insert(
                sha.to_string(),
                vt_cache::VtDiskEntry {
                    verdict: verdict.clone(),
                    detections: dets.clone(),
                    ts: now_ms(),
                    known: *known,
                },
            );
        }
        // сохраняем на диск — кэш переживает перезапуски
        if let Ok(path) = settings::vt_cache_path(app) {
            let snapshot = state.vt_cache.lock().unwrap().clone();
            vt_cache::save(&path, &snapshot);
        }
    }
    result.map(|(v, d, _)| (v, d))
}

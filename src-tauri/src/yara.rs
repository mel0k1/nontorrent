//! YARA-сканирование (yara-x, движок VirusTotal).
//!
//! Источники правил:
//!   1. встроенные — скомпилированы в бинарник через include_str! (`src-tauri/rules/`);
//!   2. пользовательские — `app_data/yara_rules/*.yar`, *.yara`, подхватываются при старте.
//!
//! Файлы читаются через mmap — большие раздачи не грузятся в память целиком.
//! Совпадение правила с meta severity = "high"/"critical" даёт вердикт «угроза»,
//! остальные совпадения — «подозрительно».

use std::path::Path;

use crate::settings;

/// Встроенные правила: (имя файла, исходник)
static BUILTIN_RULES: &[(&str, &str)] = &[
    ("eicar.yar", include_str!("../rules/eicar.yar")),
    ("droppers.yar", include_str!("../rules/droppers.yar")),
    ("lnk_dropper.yar", include_str!("../rules/lnk_dropper.yar")),
    ("masked_exec.yar", include_str!("../rules/masked_exec.yar")),
    ("packers.yar", include_str!("../rules/packers.yar")),
];

pub struct YaraEngine {
    rules: yara_x::Rules,
    /// Всего активных правил (для статистики на фронте)
    pub rule_count: u32,
    /// Сколько пользовательских файлов правил подхвачено
    pub custom_files: u32,
}

/// Итог сканирования одного файла
pub struct YaraVerdict {
    pub malicious: bool,
    pub detections: Vec<String>,
    pub rules: Vec<String>,
}

impl YaraEngine {
    /// Компиляция встроенных + пользовательских правил.
    /// Пользовательские правила с ошибками не роняют приложение — только лог.
    pub fn load(app: &tauri::AppHandle) -> YaraEngine {
        let mut compiler = yara_x::Compiler::new();
        let mut rule_count = 0u32;
        let mut custom_files = 0u32;

        for (name, src) in BUILTIN_RULES {
            match compiler.add_source(*src) {
                Ok(_) => {
                    rule_count += count_rules(src);
                    tracing::debug!("yara: встроенные правила {name} скомпилированы");
                }
                Err(e) => tracing::error!("yara: ошибка компиляции встроенных правил ({name}): {e}"),
            }
        }

        if let Ok(dir) = settings::yara_rules_dir(app) {
            if dir.is_dir() {
                let mut files: Vec<std::path::PathBuf> = walkdir::WalkDir::new(&dir)
                    .max_depth(1)
                    .into_iter()
                    .filter_map(|e| e.ok())
                    .filter(|e| {
                        e.file_type().is_file()
                            && matches!(
                                e.path().extension().and_then(|x| x.to_str()),
                                Some("yar") | Some("yara")
                            )
                    })
                    .map(|e| e.into_path())
                    .collect();
                files.sort();
                for f in files {
                    match std::fs::read_to_string(&f) {
                        Ok(src) => match compiler.add_source(&src) {
                            Ok(_) => {
                                rule_count += count_rules(&src);
                                custom_files += 1;
                                tracing::info!("yara: пользовательские правила «{}» загружены", f.display());
                            }
                            Err(e) => tracing::warn!("yara: «{}» не скомпилировано: {e}", f.display()),
                        },
                        Err(e) => tracing::warn!("yara: «{}» не читается: {e}", f.display()),
                    }
                }
            }
        }

        let rules = compiler.build();
        Self { rules, rule_count, custom_files }
    }

    /// Просканировать файл. Возвращает None, если файл нельзя прочитать
    /// (пустой, исчез, не мапится).
    pub fn scan_file(&self, path: &Path) -> Option<YaraVerdict> {
        let meta = std::fs::metadata(path).ok()?;
        if meta.len() == 0 {
            return None;
        }
        let file = std::fs::File::open(path).ok()?;
        // SAFETY: файл открыт только на чтение; во время скана перезапись
        // невозможна — вызов происходит после завершения файла в раздаче.
        let mmap = unsafe { memmap2::Mmap::map(&file) }.ok()?;
        let mut scanner = yara_x::Scanner::new(&self.rules);
        let results = scanner.scan(&mmap[..]).ok()?;

        let mut out = YaraVerdict {
            malicious: false,
            detections: Vec::new(),
            rules: Vec::new(),
        };
        for rule in results.matching_rules() {
            let name = rule.identifier().to_string();
            let severity = meta_severity(rule.metadata());
            out.rules.push(name.clone());
            if matches!(severity.as_deref(), Some("high") | Some("critical")) {
                out.malicious = true;
                out.detections.push(format!("YARA: {name} (высокая опасность)"));
            } else {
                out.detections.push(format!("YARA: {name}"));
            }
        }
        Some(out)
    }
}

/// severity из meta правила: строка или число (3=critical, 2=high)
fn meta_severity(meta: yara_x::Metadata) -> Option<String> {
    // Metadata — сам итератор по парам (ключ, значение)
    for (k, v) in meta {
        if k != "severity" {
            continue;
        }
        return match v {
            yara_x::MetaValue::String(s) => Some(s.to_string()),
            yara_x::MetaValue::Integer(i) => Some(
                match i {
                    3 => "critical",
                    2 => "high",
                    1 => "medium",
                    _ => "low",
                }
                .to_string(),
            ),
            _ => None,
        };
    }
    None
}

/// Число объявлений правил в исходнике (по строкам `rule X {`)
fn count_rules(src: &str) -> u32 {
    src.lines()
        .filter(|l| {
            let t = l.trim_start();
            t.starts_with("rule ")
                || t.starts_with("private rule ")
                || t.starts_with("global rule ")
        })
        .count() as u32
}

/// Порог размера: файлы больше этого сканируются YARA только при подозрении
/// (исполняемый заголовок / рискованное расширение) — не тратим CPU на 20-гигабайтные ремуксы.
pub const YARA_ALWAYS_LIMIT: u64 = 64 * 1024 * 1024;

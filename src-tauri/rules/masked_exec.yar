/*
   Маскировка исполняемых файлов: PE-заголовок там, где его быть не должно,
   либо явные признаки запакованного/скрытого запуска.
*/

rule pe_with_embedded_script
{
    meta:
        description = "PE-исполняемый файл со встроенным скриптом автозапуска"
        severity = "medium"
        author = "NonTorrent"

    strings:
        $hidden = "-w hidden" nocase
        $hidden2 = "-windowstyle hidden" nocase
        $enc = "-encodedcommand" nocase
        $iex = "invoke-expression" nocase
        $reg_run = "CurrentVersion\\Run" nocase

    condition:
        uint16(0) == 0x5A4D and filesize < 32MB and 1 of ($hidden, $hidden2, $enc, $iex, $reg_run)
}

rule pe_double_extension_marker
{
    meta:
        description = "PE, названный под документ или медиафайл"
        severity = "high"
        author = "NonTorrent"

    condition:
        uint16(0) == 0x5A4D and filesize < 512MB
        // имя файла проверяет эвристика Rust-конвейера; правило лишь ловит
        // переименованные PE, попавшие внутрь других форматов (архивов, ISO)
        and (
            // RAR5
            uint32(0) == 0x52617221 or
            // ZIP
            uint16(0) == 0x4B50 or
            // ISO/CD (CD001 на секторе 0x8001)
            uint32(0x8001) == 0x30314344
        )
}

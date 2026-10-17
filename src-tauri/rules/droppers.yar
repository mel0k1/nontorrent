/*
   Дропперы и загрузчики: скрипты и документы, тянущие исполняемый код из сети.
   Правила строковые, низкой цены ложных срабатываний: требуют
   одновременно загрузочный примитив и запуск полученного.
*/

rule powershell_download_cradle
{
    meta:
        description = "PowerShell: загрузка и немедленный запуск кода из сети"
        severity = "high"
        author = "NonTorrent"

    strings:
        $ps = /powershell(_|\.exe)?/i
        $enc = "-enc " nocase
        $encoded = "FromBase64String" nocase
        $iex = "IEX (" nocase
        $iex2 = "Invoke-Expression" nocase
        $down = "DownloadString" nocase
        $down2 = "DownloadFile" nocase
        $down3 = "Invoke-WebRequest" nocase
        $net = "System.Net.WebClient" nocase

    condition:
        $ps and 1 of ($enc, $encoded) and 1 of ($iex, $iex2, $down, $down2, $down3, $net)
}

rule script_downloader_chain
{
    meta:
        description = "BAT/VBS/JS-скрипт, скачивающий и запускающий файл"
        severity = "high"
        author = "NonTorrent"

    strings:
        $curl = "curl " nocase
        $wget = "wget " nocase
        $certutil = "certutil -urlcache" nocase
        $bitsadmin = "bitsadmin /transfer" nocase
        $vbsget = "MSXML2.XMLHTTP" nocase
        $exec1 = /(^|[^a-z])(start|call)\s+%.{1,4}(exe|bat|cmd|scr)/ nocase
        $exec2 = "WScript.Shell" nocase
        $exec3 = "cmd.exe /c" nocase
        $start1 = " && start " nocase
        $start2 = "start \"\" " nocase

    condition:
        1 of ($curl, $wget, $certutil, $bitsadmin, $vbsget) and 1 of ($exec1, $exec2, $exec3, $start1, $start2)
}

rule html_or_exe_polyglot
{
    meta:
        description = "Исполняемый файл, замаскированный под HTML/SVG"
        severity = "high"
        author = "NonTorrent"

    strings:
        $mz = { 4D 5A }
        $html = "<html" nocase
        $svg = "<svg" nocase
        $script = "<script" nocase

    condition:
        uint16(0) == 0x5A4D and 1 of ($html, $svg, $script)
}

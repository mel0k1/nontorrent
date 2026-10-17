/*
   Эксплойты в ярлыках Windows (.lnk): классика торрентов —
   «фильм.lnk», запускающий PowerShell/cmd с вредоносной строкой.
*/

rule lnk_exploit_shell
{
    meta:
        description = "Ярлык Windows с командной строкой исполнителя"
        severity = "high"
        author = "NonTorrent"

    strings:
        $lnk_magic = { 4C 00 00 00 01 14 02 00 }
        $cmd = "cmd.exe" nocase
        $cmd2 = "cmd /c" nocase
        $ps = "powershell" nocase
        $mshta = "mshta" nocase
        $wscript = "wscript" nocase
        $cscript = "cscript" nocase
        $rundll = "rundll32" nocase
        $regsvr = "regsvr32" nocase

    condition:
        uint32(0) == 0x0000004C and
        2 of ($cmd, $cmd2, $ps, $mshta, $wscript, $cscript, $rundll, $regsvr)
}

rule lnk_exploit_args_obfuscated
{
    meta:
        description = "Ярлык Windows со скрытым окном и кодировкой аргументов"
        severity = "high"
        author = "NonTorrent"

    strings:
        $lnk_magic = { 4C 00 00 00 01 14 02 00 }
        $hidden = "-w hidden" nocase
        $hidden2 = "-windowstyle hidden" nocase
        $b64 = "frombase64string" nocase
        $enc = "-encodedcommand" nocase

    condition:
        uint32(0) == 0x0000004C and 1 of ($hidden, $hidden2, $b64, $enc)
}

/*
   Известные упаковщики исполняемых файлов.
   Сами по себе не вредоносны, но типичны для крипто-стабов и троянов.
   severity = medium: вердикт «подозрительно», решение за пользователем.
*/

rule packer_upx
{
    meta:
        description = "UPX-упаковка секций"
        severity = "medium"
        author = "NonTorrent"

    strings:
        $upx0 = "UPX0"
        $upx1 = "UPX1"
        $upx2 = "UPX!"

    condition:
        uint16(0) == 0x5A4D and filesize < 128MB and 2 of ($upx0, $upx1, $upx2)
}

rule packer_themida_signature
{
    meta:
        description = "Признаки упаковщика Themida/WinLicense"
        severity = "medium"
        author = "NonTorrent"

    strings:
        $themida = "Themida" ascii nocase
        $winlic = "WinLicense" ascii nocase
        $junk = { 60 E8 00 00 00 00 5D 81 ED ?? ?? ?? ?? }

    condition:
        uint16(0) == 0x5A4D and filesize < 256MB and 1 of ($themida, $winlic, $junk)
}

/*
   EICAR — стандартный тестовый файл антивирусов.
   Безобидная строка для проверки работоспособности конвейера.
*/

rule eicar_test_file
{
    meta:
        description = "Стандартный тестовый образец EICAR"
        severity = "high"
        author = "NonTorrent"

    strings:
        $eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"

    condition:
        $eicar
}

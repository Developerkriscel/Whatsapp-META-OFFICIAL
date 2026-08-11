$pass = "Kriscel@1234"
$key = Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub"
$cmd = "mkdir -p ~/.ssh; echo '$key' >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys"
plink -pw $pass root@187.127.149.196 $cmd

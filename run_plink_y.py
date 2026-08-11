import subprocess
import time

ps_script = """
$p = "Kriscel@1234"
$pub = Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub"
$proc = Start-Process -FilePath "plink" -ArgumentList "-pw $p root@187.127.149.196 `"mkdir -p ~/.ssh; echo '$pub' >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys`"" -RedirectStandardInput input.txt -PassThru
"""
with open("input.txt", "w") as f:
    f.write("y\n")

print("Created input.txt")

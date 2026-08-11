import sys
import subprocess

passw = "Kriscel@1234"
key_pub = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIE7B3dHhIqrySMce38//mXmuJ41s94BZvedsJdvtuYGu krisc_knym526@Maggieee"
cmd = f"mkdir -p ~/.ssh && echo '{key_pub}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo KEY_OK"

res = subprocess.run(["plink", "-pw", passw, "root@187.127.149.196", cmd], capture_output=True, text=True)
print("STDOUT:", res.stdout)
print("STDERR:", res.stderr)

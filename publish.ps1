Set-Location $PSScriptRoot

# ── Commit ────────────────────────────────────────────────────────────────────
$msg = 'feat: IBM AWS Training Hub webapp'
git commit -m $msg
if ($LASTEXITCODE -ne 0) { Write-Error "Commit failed"; exit 1 }

# ── Remote + push ─────────────────────────────────────────────────────────────
$remote = git remote 2>&1
if ($remote -notmatch 'origin') {
    git remote add origin 'https://github.com/PRAVINMENON/aws-training-agent.git'
}

git branch -M main
git push -u origin main

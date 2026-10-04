# Runs the full vitest suite in a Linux container, as the gate the build uses.
#
# Why: the source-scan tests compare file paths written with "/" and were built on Linux;
# on Windows they read paths with "\" and fail (backlog: make them portable). Linux node
# modules live in their own Docker volume so they never collide with the Windows ones.
# Needs Docker Desktop and the working tree checked out with LF endings
# (git config core.autocrlf false).
#
#   powershell -File scripts/test-linux.ps1                 # full suite
#   powershell -File scripts/test-linux.ps1 src/lib/time    # a path, as vitest takes it
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$VitestArgs)

$repo = (Resolve-Path "$PSScriptRoot\..").Path
$image = "node:22"
$volume = "perolehan_linux_nm22"
$extra = ($VitestArgs -join " ")
$cmd = "test -f node_modules/.package-lock.json || npm ci --no-audit --no-fund; " +
  "NODE_OPTIONS=--max-old-space-size=8192 npx vitest run --testTimeout=120000 $extra"
docker run --rm -v "${repo}:/repo" -v "${volume}:/repo/node_modules" -w /repo $image sh -c $cmd
exit $LASTEXITCODE

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$tools = Join-Path $root '.tmp/live-validation/tools'
New-Item -ItemType Directory -Path $tools -Force | Out-Null
$archive = Join-Path $tools 'geckodriver-v0.37.1-win64.zip'
$expected = 'dfed9315abe8d2fbc1b6161a2ee8002452e79cf05ee92fdc653a4e26bc35edd8'
Invoke-WebRequest 'https://github.com/mozilla/geckodriver/releases/download/v0.37.1/geckodriver-v0.37.1-win64.zip' -OutFile $archive
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
  throw 'geckodriver archive checksum mismatch. It was not extracted or executed.'
}
Expand-Archive -LiteralPath $archive -DestinationPath $tools -Force
Write-Output "Verified geckodriver installed locally at $tools"

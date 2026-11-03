# Sobe tudo o que o bot precisa, sem Docker: Qdrant, Ollama e a API (e o ngrok com -Ngrok).
# Uso: powershell -ExecutionPolicy Bypass -File start.ps1 [-Ngrok]
# Servicos que ja estiverem no ar sao mantidos. A API fica neste terminal; Ctrl+C encerra so ela.
param(
  [switch]$Ngrok,
  [string]$QdrantDir = "$env:USERPROFILE\qdrant",
  [string]$NgrokUrl = "https://pokiest-glossless-oakley.ngrok-free.dev"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force logs | Out-Null

function Test-Url($url) {
  try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null; return $true } catch { return $false }
}

function Wait-Url($url, $nome) {
  for ($i = 0; $i -lt 30; $i++) {
    if (Test-Url $url) { Write-Host "[ok] $nome"; return }
    Start-Sleep -Seconds 1
  }
  throw "$nome nao respondeu em $url"
}

if (Test-Url "http://127.0.0.1:6333/healthz") {
  Write-Host "[ok] Qdrant ja estava no ar"
} else {
  # Roda dentro da pasta do Qdrant para usar os dados de storage/
  Start-Process -FilePath (Join-Path $QdrantDir "qdrant.exe") -WorkingDirectory $QdrantDir -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $QdrantDir "qdrant.log") -RedirectStandardError (Join-Path $QdrantDir "qdrant-erros.log")
  Wait-Url "http://127.0.0.1:6333/healthz" "Qdrant"
}

if (Test-Url "http://127.0.0.1:11434/api/version") {
  # A variavel so vale quando o proprio script inicia o Ollama (ex.: o app da bandeja nao a recebe)
  Write-Host "[aviso] Ollama ja estava no ar: para usar 4 respostas em paralelo, feche-o e rode este script de novo"
} else {
  # 4 respostas em paralelo: no benchmark, reduziu em 37% o tempo de 40 perguntas simultaneas
  $env:OLLAMA_NUM_PARALLEL = "4"
  Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
  Wait-Url "http://127.0.0.1:11434/api/version" "Ollama"
}

if ($Ngrok -and (Get-Process -Name ngrok -ErrorAction SilentlyContinue)) {
  Write-Host "[ok] ngrok ja estava no ar"
} elseif ($Ngrok) {
  Start-Process -FilePath "ngrok" -ArgumentList "http 3000 --url=$NgrokUrl --log=stdout" -WindowStyle Hidden `
    -RedirectStandardOutput "logs\ngrok.log" -RedirectStandardError "logs\ngrok_err.log"
  Write-Host "[ok] ngrok: $NgrokUrl"
}

# As mensagens dos alunos e as respostas ficam em logs/ (fora do git). O cmd grava os bytes como vieram, em UTF-8
$log = "logs\api_$(Get-Date -Format yyyyMMdd_HHmmss).log"
Write-Host "[ok] API em http://localhost:3000 | log: $log"
cmd /c "node src\server.js >> $log 2>&1"

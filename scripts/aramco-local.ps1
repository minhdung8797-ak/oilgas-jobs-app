<#
  Chay scraper cho cac nguon CHAN IP TRUNG TAM DU LIEU, tu chinh may cua ban.

  VI SAO PHAI CHAY O DAY MA KHONG PHAI TREN MAY CHU
  -------------------------------------------------
  Saudi Aramco chan theo dai IP. Do duoc ba lan, ba noi:

      Render (Oregon)   1131 giay -> 0 tin
      Render (Oregon)   1128 giay -> 0 tin
      GitHub Actions    1126 giay -> 0 tin
      May cua ban        0.3 giay -> 52 tin (6 tu khoa)

  Moi request tu may chu deu treo toi het gio roi tra rong - dac trung cua
  tuong lua chong bot, khong phai loi cau hinh. Tu IP dan dung thi vao binh
  thuong. Nen nguon nay chi co the chay tu day.

  KHONG lach bang cach gia User-Agent trinh duyet hay dung proxy vuot rao.
  Script nay gui dung UA that cua bot, va chi lay du lieu cong khai.

  Ghi thang vao Neon, khong di qua API tren Render - nen khong phu thuoc
  viec API co dang ngu hay khong.

  CACH DUNG
  ---------
      .\scripts\aramco-local.ps1              # chay nguon aramco
      .\scripts\aramco-local.ps1 -Source slb  # chay nguon khac
      .\scripts\aramco-local.ps1 -Rebuild     # ep build lai truoc khi chay

  Muon chay tu dong hang ngay: xem scripts\setup-aramco-task.ps1
#>

[CmdletBinding()]
param(
  # Key cua nguon, dung ten trong scraper.registry.ts
  [string]$Source = 'aramco',

  # Ep build lai ke ca khi da co dist. Dung sau khi sua code.
  [switch]$Rebuild
)

$ErrorActionPreference = 'Stop'

# Moc duong dan theo vi tri script, KHONG theo thu muc dang dung.
# Ly do: Task Scheduler chay task voi thu muc hien hanh la C:\Windows\System32.
$Root   = Split-Path -Parent $PSScriptRoot
$ApiDir = Join-Path $Root 'apps\api'
$LogDir = Join-Path $Root 'logs'
$LogFile = Join-Path $LogDir ("aramco-{0}.log" -f (Get-Date -Format 'yyyy-MM'))

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log {
  param([string]$Msg, [string]$Level = 'INFO')
  $line = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Msg
  Write-Host $line
  Add-Content -Path $LogFile -Value $line -Encoding utf8
}

function Fail {
  param([string]$Msg)
  Log $Msg 'LOI'
  exit 1
}

<#
  Chay mot chuong trinh ngoai (node, pnpm, corepack) roi kiem tra ma thoat.

  Vi sao khong goi thang: PowerShell 5.1 voi $ErrorActionPreference = 'Stop'
  coi MOI dong ghi ra stderr cua chuong trinh ngoai la loi chi mang. NestJS
  ghi log khoi dong qua stderr, nen goi thang se lam script chet ngay khi
  scraper vua chay - du khong co gi sai. Ha tam thoi xuong 'Continue' roi tu
  kiem tra $LASTEXITCODE moi la cach doc dung ket qua cua chuong trinh ngoai.
#>
function Invoke-Native {
  param([scriptblock]$Block, [string]$What)
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Block } finally { $ErrorActionPreference = $old }
  if ($LASTEXITCODE -ne 0) { Fail "$What that bai (ma loi $LASTEXITCODE)." }
}

Log "===== Bat dau: nguon '$Source' ====="

# -- 1. Kiem tra cong cu ----------------------------------------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail "Chua cai Node.js. Tai ban LTS tai https://nodejs.org roi mo lai cua so nay."
}
$nodeMajor = [int](( node -v ).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 18) { Fail "Node.js $((node -v)) qua cu. Can tu phien ban 18 tro len." }
Log "Node.js $(node -v)"

<#
  Tim cach chay pnpm, thu ba duong theo thu tu it can quyen dan len.

  Vi sao khong chi dua vao corepack: `corepack enable` ghi shim vao THU MUC CAI
  NODE (C:\Program Files\nodejs), nen may thuong bi Windows tu choi quyen. Da
  gap that: Node v24.18.0, corepack chay xong ma khong tao ra lenh pnpm nao.

  Duong cuoi cung - npx - khong cai gi vao he thong ca, npm tu tai pnpm ve bo
  nho dem roi chay. Cham hon vai giay nhung khong bao gio hong vi thieu quyen.

  Khong dung npm thay cho pnpm duoc: repo nay la pnpm workspace, cac goi noi bo
  khai bao dang "workspace:*" ma npm khong hieu.
#>
$script:PnpmCmd = $null   # ten chuong trinh se goi
$script:PnpmPre  = @()    # tham so dat truoc, dung cho duong npx

function Try-Quiet {
  param([scriptblock]$Block)
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $Block 2>&1 | Out-Null } catch { Log ("  ...khong duoc: {0}" -f $_.Exception.Message) 'CANHBAO' }
  finally { $ErrorActionPreference = $old }
}

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
              [Environment]::GetEnvironmentVariable('Path','User')
}

function Resolve-Pnpm {
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    $script:PnpmCmd = 'pnpm'; return
  }

  Log "Chua co pnpm. Thu 1/3: corepack..."
  Try-Quiet { corepack enable }
  Try-Quiet { corepack prepare pnpm@9.12.0 --activate }
  Refresh-Path
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    Log "  -> duoc (corepack)"; $script:PnpmCmd = 'pnpm'; return
  }

  Log "Thu 2/3: npm install -g pnpm@9 (cai vao thu muc nguoi dung, khong can admin)..."
  Try-Quiet { npm install -g pnpm@9 }
  Refresh-Path
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    Log "  -> duoc (npm -g)"; $script:PnpmCmd = 'pnpm'; return
  }

  Log "Thu 3/3: chay qua npx, khong cai gi vao he thong."
  if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    Fail "Khong co ca pnpm lan npx. Cai lai Node.js ban LTS tu https://nodejs.org."
  }
  $script:PnpmCmd = 'npx'; $script:PnpmPre = @('--yes', 'pnpm@9.12.0')
  Log "  -> dung npx (lan dau se tai pnpm ve, mat them vai giay)"
}

<#
  Goi pnpm bat ke no den tu duong nao (pnpm that hay npx).

  CAN THAN voi cu phap rai tham so: chi `@tenBien` moi la rai, con `@(...)` la
  toan tu tao mang - dat trong loi goi thi PowerShell truyen ca mang thanh MOT
  tham so duy nhat. Da dinh that: `& $exe @($pre + $args)` lam pnpm nhan duoc
  chuoi "install --prod=false" va bao 'Command not found'. Nen phai gan mang
  vao mot bien roi rai bang @all.
#>
function Invoke-Pnpm {
  param([string[]]$PnpmArgs, [string]$What)
  $exe = $script:PnpmCmd
  $all = @($script:PnpmPre) + $PnpmArgs

  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $exe @all } finally { $ErrorActionPreference = $old }
  if ($LASTEXITCODE -ne 0) { Fail "$What that bai (ma loi $LASTEXITCODE)." }
}

Resolve-Pnpm
Invoke-Pnpm @('--version') 'pnpm --version'

<#
  -- 2. Chon dung chuoi ket noi ---------------------------------------------

  File .env o thu muc goc chua chuoi DEV tro ve Postgres trong Docker
  (postgresql://ogjobs:...@localhost:5432). Script nay khong chay de dev - no
  phai ghi vao Neon, cung database ma trang web dang doc. Ghi vao localhost
  thi khong ai thay gi ca.

  Nen chuoi cho scraper de rieng o .env.scraper, va script dat thang vao bien
  moi truong. Bien moi truong co san luon THANG dotenv (dotenv khong bao gio
  ghi de bien da ton tai), nen dat o day la du - khong can sua .env.
#>
function Get-DbUrlFrom {
  param([string]$File)
  if (-not (Test-Path $File)) { return $null }
  $line = Select-String -Path $File -Pattern '^\s*DATABASE_URL\s*=' | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line.Line -split '=', 2)[1].Trim().Trim('"').Trim("'")
}

$ScraperEnv = Join-Path $Root '.env.scraper'
$dbVal = $env:DATABASE_URL
$dbFrom = 'bien moi truong san co'

if (-not $dbVal) { $dbVal = Get-DbUrlFrom $ScraperEnv; if ($dbVal) { $dbFrom = '.env.scraper' } }
if (-not $dbVal) { $dbVal = Get-DbUrlFrom (Join-Path $Root '.env'); if ($dbVal) { $dbFrom = '.env' } }

if (-not $dbVal) {
  Fail @"
Khong tim thay DATABASE_URL.
Tao file .env.scraper o $Root voi mot dong duy nhat:
    DATABASE_URL=postgresql://<user>:<pass>@ep-xxxx.<region>.aws.neon.tech/neondb?sslmode=require
Lay chuoi do o Neon: Dashboard -> Connection string (bo chon 'Pooled connection').
"@
}

if ($dbVal -notmatch '^postgres(ql)?://') {
  # In 10 ky tu dau de nhan dien loi ma khong lo mat khau
  Fail ("DATABASE_URL sai dinh dang - phai bat dau bang postgresql://. 10 ky tu dau: [{0}]" -f $dbVal.Substring(0, [Math]::Min(10, $dbVal.Length)))
}

# Chan truong hop tro ve may noi bo. Da dinh that: chuoi dev trong .env tro ve
# localhost, scraper chay tron tru nhung ghi vao mot database rong khong ai doc.
if ($dbVal -match '@(localhost|127\.0\.0\.1|\[::1\])[:/]') {
  Fail @"
DATABASE_URL dang tro ve localhost (day la chuoi dev cua Docker trong file .env).
Scraper nay phai ghi vao Neon - cung database ma trang web dang doc.
Tao file .env.scraper o $Root voi chuoi Neon that; no se duoc uu tien hon .env.
"@
}

# Dat thang vao tien trinh con. Ghi de moi thu dotenv se doc sau do.
$env:DATABASE_URL = $dbVal
$dbHost = if ($dbVal -match '@([^:/?]+)') { $Matches[1] } else { '?' }
Log "DATABASE_URL: lay tu $dbFrom, may chu = $dbHost"

Push-Location $Root
try {
  # -- 3. Cai dependencies neu thieu ----------------------------------------
  if (-not (Test-Path (Join-Path $ApiDir 'node_modules'))) {
    Log "Chua co node_modules, dang cai (lan dau mat vai phut)..."
    # --prod=false: nest/prisma/tsc deu nam trong devDependencies. Thieu co nay
    # thi build chet voi 'Command "nest" not found' - dung loi da lam workflow
    # GitHub do 6 lan lien.
    Invoke-Pnpm @('install', '--prod=false') 'pnpm install'
  }

  # -- 4. Build neu thieu hoac khi duoc yeu cau -----------------------------
  $Cli = Join-Path $ApiDir 'dist\scripts\scrape-cli.js'
  if ($Rebuild -or -not (Test-Path $Cli)) {
    Log "Dang build..."
    Invoke-Pnpm @('--filter', '@og/shared', 'build')             'Build @og/shared'
    Invoke-Pnpm @('--filter', '@og/api', 'exec', 'prisma', 'generate') 'prisma generate'
    Invoke-Pnpm @('--filter', '@og/api', 'build')                'Build @og/api'
    Log "Build xong"
  }

  # -- 5. Chay scraper ------------------------------------------------------
  # runSource() goi thang vao registry nen chay duoc ca nguon dang `enabled:false`
  # - khong can dat SCRAPER_FORCE_SOURCES, va khong lam anh huong Render.
  $env:NODE_ENV                 = 'production'
  $env:SCRAPER_ENABLED          = 'true'
  $env:SCRAPER_CONCURRENCY      = '2'
  $env:SCRAPER_REQUEST_DELAY_MS = '2500'   # lich su voi may chu cua ho
  $env:CRON_ENABLED             = 'false'  # khong bat lich trong tien trinh nay
  $env:HF_ENABLED               = 'false'

  Log "Dang chay scraper '$Source'..."
  Push-Location $ApiDir
  try {
    Invoke-Native { node dist\scripts\scrape-cli.js $Source 2>&1 | Tee-Object -FilePath $LogFile -Append } "scrape-cli '$Source'"
  } finally { Pop-Location }

  Log "===== Xong ====="
  exit 0
}
finally { Pop-Location }

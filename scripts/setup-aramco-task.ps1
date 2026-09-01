<#
  Dang ky mot tac vu Windows chay aramco-local.ps1 moi ngay.

  Chay MOT LAN duy nhat:
      .\scripts\setup-aramco-task.ps1

  Doi gio:
      .\scripts\setup-aramco-task.ps1 -Time 21:00

  Go bo:
      .\scripts\setup-aramco-task.ps1 -Remove

  GHI CHU VE VIEC MAY PHAI BAT
  ----------------------------
  Tac vu dat -StartWhenAvailable, nghia la neu den gio ma may dang tat hoac
  dang ngu, Windows se chay bu ngay khi may bat lai. Nen ban khong can canh
  gio - chi can trong ngay co luc mo may la duoc.

  Khong danh thuc may (khong dat -WakeToRun): mot trinh thu thap viec lam
  khong dang de danh thuc may tinh luc nua dem.
#>

[CmdletBinding()]
param(
  # Gio chay hang ngay, dinh dang 24h.
  [string]$Time = '10:30',

  # Go bo tac vu thay vi tao.
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$TaskName = 'OilGas - Thu thap Aramco hang ngay'
$Script   = Join-Path $PSScriptRoot 'aramco-local.ps1'

if ($Remove) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Da go bo tac vu '$TaskName'."
  } else {
    Write-Host "Khong tim thay tac vu '$TaskName' - khong co gi de go."
  }
  return
}

if (-not (Test-Path $Script)) { throw "Khong thay $Script" }

# -WindowStyle Hidden: chay am tham, khong nhay cua so len giua luc dang lam viec.
# Ket qua van duoc ghi vao logs\aramco-YYYY-MM.log.
$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $Script)

$trigger = New-ScheduledTaskTrigger -Daily -At $Time

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RunOnlyIfNetworkAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
  -MultipleInstances IgnoreNew

try {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Description 'Thu thap viec lam Saudi Aramco tu IP dan dung (may chu bi chan IP).' `
    -Force | Out-Null
} catch {
  throw ("Khong dang ky duoc tac vu: {0}`nNeu bao tu choi truy cap, mo PowerShell bang chuot phai -> Run as administrator roi chay lai." -f $_.Exception.Message)
}

Write-Host "Da tao tac vu '$TaskName', chay moi ngay luc $Time."
Write-Host "Neu den gio may dang tat, Windows se chay bu khi ban bat may."
Write-Host ""
Write-Host "Chay thu ngay bay gio:  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Xem lan chay gan nhat:  Get-ScheduledTaskInfo -TaskName '$TaskName'"
Write-Host "Xem nhat ky:            logs\aramco-$(Get-Date -Format 'yyyy-MM').log"

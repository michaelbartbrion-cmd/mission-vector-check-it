# Portable Node broker installation on Enterprise.
# No Chrome process is launched, no credentials are stored, no official checks
# or CrewSense actions are taken. A logged-in, dedicated browser tab is
# separately required before any source capture can occur.
[CmdletBinding()]
param([switch]$StartNow,[switch]$NoTask)
$ErrorActionPreference='Stop'
$source=Split-Path -Parent $MyInvocation.MyCommand.Path
$workerHome=Join-Path $env:LOCALAPPDATA 'MissionVectorCheckItWorker'
$bin=Join-Path $workerHome 'bin'
New-Item -ItemType Directory -Force $bin | Out-Null
$node=(Get-Command node.exe -ErrorAction Stop).Source
foreach($filename in @('scheduler.mjs','daemon.mjs')){
    Copy-Item (Join-Path $source $filename) (Join-Path $bin $filename) -Force
}
$task='MissionVectorCheckIt-BackgroundWorker'
$daemon=Join-Path $bin 'daemon.mjs'
if(-not $NoTask){
    $username=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $action=New-ScheduledTaskAction -Execute $node -Argument "`"$daemon`""
    $trigger=New-ScheduledTaskTrigger -AtLogOn -User $username
    $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Settings $settings -User $username -Force | Out-Null
}
if($StartNow){
    $existing=Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 18764 -State Listen -ErrorAction SilentlyContinue
    if(-not $existing){
        if(-not $NoTask){
            Start-ScheduledTask -TaskName $task
        }else{
            Start-Process -FilePath $node -ArgumentList "`"$daemon`"" -WindowStyle Hidden
        }
    }
}
$check=$null
try{$check=Invoke-RestMethod -Uri 'http://127.0.0.1:18764/health' -TimeoutSec 4}catch{}
[pscustomobject]@{
    Task=$task
    TaskInstalled=(-not $NoTask)
    Executable=$node
    InstalledScript=$daemon
    BrokerReachable=($null -ne $check -and $check.ok -eq $true)
    ReadOnly=($null -ne $check -and $check.mode -eq 'read_only')
    Staffing=if($check){$check.staffing.clientState}else{'unknown'}
    Ppe=if($check){$check.ppe.clientState}else{'unknown'}
} | Format-List

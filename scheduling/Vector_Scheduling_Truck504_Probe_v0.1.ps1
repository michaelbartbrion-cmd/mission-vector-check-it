<#
Mission Vector Check It - Vector Scheduling Truck 504 Probe v0.1
READ ONLY. Queries GET /v1/schedule and exports evidence for the scheduling assistant.
API credentials are requested at runtime and are never saved or printed.
#>

[CmdletBinding()]
param(
    [datetime]$Start = (Get-Date).Date.AddDays(-30),
    [datetime]$End = (Get-Date).Date.AddDays(60),
    [Parameter(Mandatory=$true)]
    [string]$CrewConfigPath,
    [string]$OutputDirectory = (Join-Path $PWD 'vector-scheduling-export')
)

$ErrorActionPreference = 'Stop'
if ($End -lt $Start) { throw 'End must be on or after Start.' }
$Base = 'https://api.crewsense.com'
if (-not (Test-Path $CrewConfigPath)) { throw "Crew config not found: $CrewConfigPath" }
$config = Get-Content -Raw -Path $CrewConfigPath | ConvertFrom-Json
$ApparatusName = [string]$config.apparatusName
if (-not $ApparatusName) { throw 'Crew config must include apparatusName.' }
$People = @($config.people)
if (-not $People.Count) { throw 'Crew config must include people[].' }
$Crew = [ordered]@{}
foreach ($person in $People) {
    if (-not $person.id -or -not $person.name) { throw 'Each crew person requires id and name.' }
    $Crew[[string]$person.id] = [string]$person.name
}

function Get-SecretText([Security.SecureString]$Secure) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Get-DutyCode($Shift) {
    $values = New-Object System.Collections.Generic.List[string]
    foreach ($q in @($Shift.qualifiers)) { foreach ($v in @($q.shortcode, $q.name)) { if ($v) { $values.Add([string]$v) } } }
    foreach ($label in @($Shift.labels)) { foreach ($v in @($label.label, $label.name)) { if ($v) { $values.Add([string]$v) } } }
    $joined = $values -join ' '
    foreach ($code in @('TABC','TAFIT','TADE','TAC','DE-A','Capt','FFB','TM','Swing')) {
        if ($joined -match ('(?i)(^|\W)' + [regex]::Escape($code) + '(\W|$)')) { return $code }
    }
    if ($values.Count) { return $values[0] }
    return $null
}

function Get-TimeOffName($Item) {
    if ($Item.time_off_type.name) { return [string]$Item.time_off_type.name }
    if ($Item.time_off_type.label) { return [string]$Item.time_off_type.label }
    if ($Item.type.name) { return [string]$Item.type.name }
    return 'Time Off'
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
Write-Host 'Vector Scheduling schedule probe - READ ONLY' -ForegroundColor Cyan
Write-Host ("Range: {0:yyyy-MM-dd} through {1:yyyy-MM-dd}" -f $Start, $End)
$ClientId = Read-Host 'Vector API Client ID'
$SecureSecret = Read-Host 'Vector API Secret' -AsSecureString
$ClientSecret = Get-SecretText $SecureSecret
try {
    $token = Invoke-RestMethod -Method Post -Uri "$Base/oauth/access_token" `
        -ContentType 'application/x-www-form-urlencoded' `
        -Body @{ client_id=$ClientId; client_secret=$ClientSecret; grant_type='client_credentials' }
}
finally { $ClientSecret = $null; $SecureSecret = $null }
if (-not $token.access_token) { throw 'Authentication returned no access_token.' }

$headers = @{ Authorization = "Bearer $($token.access_token)" }
$startText = $Start.ToString('yyyy-MM-dd 00:00:00')
$endText = $End.AddDays(1).ToString('yyyy-MM-dd 00:00:00')
$uri = "$Base/v1/schedule?start=$([uri]::EscapeDataString($startText))&end=$([uri]::EscapeDataString($endText))"
$response = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$capturedAt = (Get-Date).ToUniversalTime().ToString('o')
$rawPath = Join-Path $OutputDirectory "vector-schedule-raw-$stamp.json"
$response | ConvertTo-Json -Depth 30 | Set-Content -Path $rawPath -Encoding UTF8
$nameToId = @{}
foreach ($entry in $Crew.GetEnumerator()) { $nameToId[$entry.Value.ToLowerInvariant()] = $entry.Key }
$observations = New-Object System.Collections.Generic.List[object]

foreach ($day in @($response.days)) {
    $date = [string]$day.date
    if (-not $date) { continue }
    $candidateMap = @{}
    foreach ($id in $Crew.Keys) { $candidateMap[$id] = New-Object System.Collections.Generic.List[object] }

    foreach ($assignment in @($day.assignments)) {
        foreach ($shift in @($assignment.shifts)) {
            $name = [string]$shift.user.name
            if (-not $name) { continue }
            $id = $nameToId[$name.ToLowerInvariant()]
            if (-not $id) { continue }
            $duty = Get-DutyCode $shift
            $candidateMap[$id].Add([pscustomobject]@{
                date=$date; personId=$id; personName=$Crew[$id]; capturedAt=$capturedAt
                assignment=[string]$assignment.name; dutyCode=$duty; found=$true; source='vector-api-schedule'
                rawText=("{0} {1} {2}" -f $name,$duty,$assignment.name).Trim(); shiftId=$shift.id; assignmentId=$assignment.id
            })
        }
    }

    foreach ($off in @($day.time_off)) {
        $name = [string]$off.user.name
        if (-not $name) { continue }
        $id = $nameToId[$name.ToLowerInvariant()]
        if (-not $id) { continue }
        $offName = Get-TimeOffName $off
        $candidateMap[$id].Add([pscustomobject]@{
            date=$date; personId=$id; personName=$Crew[$id]; capturedAt=$capturedAt
            assignment=$offName; dutyCode=$null; found=$true; source='vector-api-schedule'
            rawText=("{0} {1}" -f $name,$offName); timeOffId=$off.id
        })
    }

    foreach ($id in $Crew.Keys) {
        $rows = @($candidateMap[$id])
        if (-not $rows.Count) {
            $observations.Add([pscustomobject]@{date=$date;personId=$id;personName=$Crew[$id];capturedAt=$capturedAt;assignment=$null;dutyCode=$null;found=$false;source='vector-api-schedule';rawText=''})
            continue
        }
        $best = $rows | Sort-Object `
            @{Expression={ if ($_.assignment -eq $ApparatusName) {0} elseif ($_.assignment -match 'Truck|Engine|Medic|Battalion|Deployment|Training|Additional') {1} else {2} }}, `
            @{Expression={ if ($_.dutyCode) {0} else {1} }} | Select-Object -First 1
        $observations.Add($best)
    }
}

$import = [ordered]@{
    schemaVersion=1; generatedAt=$capturedAt; source='Vector Scheduling GET /v1/schedule read-only probe'
    settings=[ordered]@{
        apparatusName=$ApparatusName
        firefighters=@($People | Where-Object { $_.kind -eq 'firefighter' } | ForEach-Object { [ordered]@{id=[string]$_.id;name=[string]$_.name;kind='firefighter'} })
        command=@($People | Where-Object { $_.kind -eq 'command' } | ForEach-Object { [ordered]@{id=[string]$_.id;name=[string]$_.name;kind='command'} })
    }
    history=@(); plans=@(); observations=@($observations)
}
$importPath = Join-Path $OutputDirectory "vector-scheduling-helper-import-$stamp.json"
$csvPath = Join-Path $OutputDirectory "vector-scheduling-observations-$stamp.csv"
$import | ConvertTo-Json -Depth 20 | Set-Content -Path $importPath -Encoding UTF8
$observations | Select-Object date,personId,personName,dutyCode,assignment,found,source,capturedAt,rawText | Export-Csv -NoTypeInformation -Path $csvPath -Encoding UTF8
Write-Host "Raw API evidence: $rawPath" -ForegroundColor Green
Write-Host "Helper import JSON: $importPath" -ForegroundColor Green
Write-Host "Readable CSV: $csvPath" -ForegroundColor Green
Write-Host 'No Vector Scheduling data was modified.' -ForegroundColor Cyan

<#
Mission Vector Check It - Vector Scheduling Truck 504 Probe v0.2
READ ONLY.

Purpose:
- Authenticate with the official Vector Scheduling integration API.
- Read GET /v1/schedule for a date range.
- Preserve the raw response before attempting to normalize it.
- Export primary observations plus all candidate evidence for configured crew.
- Never create, modify, move, or delete Vector Scheduling data.

Credentials are requested at runtime and are never written to output files.
#>

[CmdletBinding()]
param(
    [datetime]$Start = (Get-Date).Date.AddDays(-30),
    [datetime]$End = (Get-Date).Date.AddDays(90),
    [Parameter(Mandatory=$true)]
    [string]$CrewConfigPath,
    [string]$OutputDirectory = (Join-Path $PWD 'vector-scheduling-export')
)

$ErrorActionPreference = 'Stop'
$Base = 'https://api.crewsense.com'

if ($End -lt $Start) { throw 'End must be on or after Start.' }
if (-not (Test-Path -LiteralPath $CrewConfigPath)) { throw "Crew config not found: $CrewConfigPath" }

$config = Get-Content -Raw -LiteralPath $CrewConfigPath | ConvertFrom-Json
$ApparatusName = [string]$config.apparatusName
if (-not $ApparatusName) { throw 'Crew config must include apparatusName.' }
$People = @($config.people)
if (-not $People.Count) { throw 'Crew config must include people[].' }

$Crew = [ordered]@{}
$nameToId = @{}
foreach ($person in $People) {
    if (-not $person.id -or -not $person.name) { throw 'Each crew person requires id and name.' }
    $id = [string]$person.id
    $name = [string]$person.name
    $Crew[$id] = $name
    $nameToId[$name.ToLowerInvariant()] = $id
}

function Get-SecretText([Security.SecureString]$Secure) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Get-AccessToken([string]$ClientId, [Security.SecureString]$SecureSecret) {
    $plainSecret = Get-SecretText $SecureSecret
    try {
        $result = Invoke-RestMethod -Method Post -Uri "$Base/oauth/access_token" `
            -ContentType 'application/x-www-form-urlencoded' `
            -Body @{ client_id=$ClientId; client_secret=$plainSecret; grant_type='client_credentials' }
    }
    finally {
        $plainSecret = $null
    }
    if (-not $result.access_token) { throw 'Authentication returned no access_token.' }
    return $result
}

function Get-HttpStatusCode($ErrorRecord) {
    try {
        if ($ErrorRecord.Exception.Response.StatusCode.value__) { return [int]$ErrorRecord.Exception.Response.StatusCode.value__ }
    } catch {}
    try {
        if ($ErrorRecord.Exception.Response.StatusCode) { return [int]$ErrorRecord.Exception.Response.StatusCode }
    } catch {}
    return $null
}

function Invoke-VectorScheduleGet(
    [string]$Uri,
    [string]$ClientId,
    [Security.SecureString]$SecureSecret,
    $InitialToken
) {
    $token = $InitialToken
    for ($attempt=1; $attempt -le 2; $attempt++) {
        try {
            $headers = @{ Authorization = "Bearer $($token.access_token)"; Accept='application/json' }
            $web = Invoke-WebRequest -Method Get -Uri $Uri -Headers $headers
            return [pscustomobject]@{ WebResponse=$web; Token=$token; Retried=($attempt -gt 1) }
        }
        catch {
            $status = Get-HttpStatusCode $_
            if ($status -eq 401 -and $attempt -eq 1) {
                Write-Warning 'Vector returned 401. Requesting a fresh app token and retrying once.'
                $token = Get-AccessToken -ClientId $ClientId -SecureSecret $SecureSecret
                continue
            }
            if ($status -eq 403) {
                throw "Vector returned 403 Forbidden. Check organization API access / token requirements. Original error: $($_.Exception.Message)"
            }
            if ($status -eq 422) {
                throw "Vector returned 422 Invalid Parameters. Check the requested date range/parameter format. Original error: $($_.Exception.Message)"
            }
            throw
        }
    }
    throw 'Schedule request failed after retry.'
}

function Get-DutyCode($Shift) {
    $values = New-Object System.Collections.Generic.List[string]
    foreach ($q in @($Shift.qualifiers)) {
        foreach ($v in @($q.shortcode, $q.name)) { if ($v) { $values.Add([string]$v) } }
    }
    foreach ($label in @($Shift.labels)) {
        foreach ($v in @($label.label, $label.name)) { if ($v) { $values.Add([string]$v) } }
    }
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

function Get-FirstValue($Object, [string[]]$Names) {
    foreach ($name in $Names) {
        try {
            $value = $Object.$name
            if ($null -ne $value -and [string]$value -ne '') { return $value }
        } catch {}
    }
    return $null
}

function Test-OperationalAssignment([string]$Assignment) {
    return $Assignment -match '(?i)\b(Truck|Engine|Medic|Battalion|Deployment|Training|Additional Hours|Support Services|Prevention|Command Staff)\b'
}

function Select-PrimaryEvidence($Rows, [string]$HomeApparatus) {
    $items = @($Rows)
    if (-not $items.Count) { return $null }

    $home = @($items | Where-Object { $_.evidenceType -eq 'assignment' -and $_.assignment -eq $HomeApparatus })
    $off = @($items | Where-Object { $_.evidenceType -eq 'time-off' })
    $otherWork = @($items | Where-Object { $_.evidenceType -eq 'assignment' -and $_.assignment -ne $HomeApparatus -and (Test-OperationalAssignment $_.assignment) })

    if ($home.Count) { return $home | Sort-Object @{Expression={if ($_.dutyCode) {0} else {1}}} | Select-Object -First 1 }
    if ($otherWork.Count) { return $otherWork | Sort-Object @{Expression={if ($_.dutyCode) {0} else {1}}} | Select-Object -First 1 }
    if ($off.Count) { return $off | Select-Object -First 1 }
    return $items | Select-Object -First 1
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
Write-Host 'Vector Scheduling Truck 504 schedule probe v0.2 - READ ONLY' -ForegroundColor Cyan
Write-Host ("Range: {0:yyyy-MM-dd} through {1:yyyy-MM-dd}" -f $Start, $End)
Write-Host 'No schedule write operations are implemented by this script.' -ForegroundColor Cyan

$ClientId = Read-Host 'Vector API Client ID'
$SecureSecret = Read-Host 'Vector API Secret' -AsSecureString
$token = Get-AccessToken -ClientId $ClientId -SecureSecret $SecureSecret

$startText = $Start.ToString('yyyy-MM-dd 00:00:00')
$endText = $End.AddDays(1).ToString('yyyy-MM-dd 00:00:00')
$uri = "$Base/v1/schedule?start=$([uri]::EscapeDataString($startText))&end=$([uri]::EscapeDataString($endText))"

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$capturedAt = (Get-Date).ToUniversalTime().ToString('o')
$rawPath = Join-Path $OutputDirectory "vector-schedule-raw-$stamp.json"
$metadataPath = Join-Path $OutputDirectory "vector-schedule-metadata-$stamp.json"
$importPath = Join-Path $OutputDirectory "vector-scheduling-helper-import-$stamp.json"
$csvPath = Join-Path $OutputDirectory "vector-scheduling-observations-$stamp.csv"
$candidatesPath = Join-Path $OutputDirectory "vector-scheduling-candidates-$stamp.json"

try {
    $result = Invoke-VectorScheduleGet -Uri $uri -ClientId $ClientId -SecureSecret $SecureSecret -InitialToken $token
    $web = $result.WebResponse
    $rawText = [string]$web.Content
    $rawText | Set-Content -LiteralPath $rawPath -Encoding UTF8

    $etag = $null
    try { $etag = [string]$web.Headers.ETag } catch {}
    if (-not $etag) {
        try { $etag = [string]$web.Headers['ETag'] } catch {}
    }

    [ordered]@{
        schemaVersion=1
        capturedAt=$capturedAt
        requestUri=$uri
        httpStatus=[int]$web.StatusCode
        etag=$etag
        tokenRefreshedAfter401=[bool]$result.Retried
        rawEvidenceFile=[IO.Path]::GetFileName($rawPath)
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $metadataPath -Encoding UTF8

    try { $response = $rawText | ConvertFrom-Json }
    catch {
        throw "Vector returned a response that could not be decoded as JSON. Raw evidence was preserved at: $rawPath"
    }

    if ($null -eq $response.days) {
        throw "The live schedule response did not contain the currently expected 'days' collection. Raw evidence was preserved at: $rawPath. Do not guess the schema; update the adapter from this evidence."
    }

    $observations = New-Object System.Collections.Generic.List[object]
    $allCandidates = New-Object System.Collections.Generic.List[object]

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
                $assignmentName = [string]$assignment.name
                $candidate = [pscustomobject]@{
                    date=$date
                    personId=$id
                    personName=$Crew[$id]
                    capturedAt=$capturedAt
                    evidenceType='assignment'
                    assignment=$assignmentName
                    assignmentCode=(Get-FirstValue $assignment @('code','shortcode'))
                    dutyCode=$duty
                    found=$true
                    source='vector-api-schedule-v0.2'
                    rawText=("{0} {1} {2}" -f $name,$duty,$assignmentName).Trim()
                    shiftId=$shift.id
                    assignmentId=$assignment.id
                    shiftStart=(Get-FirstValue $shift @('start','start_time','starts_at'))
                    shiftEnd=(Get-FirstValue $shift @('end','end_time','ends_at'))
                    durationHours=(Get-FirstValue $shift @('length','duration'))
                    breakStart=(Get-FirstValue $shift @('break_start'))
                    breakEnd=(Get-FirstValue $shift @('break_end'))
                    breakLength=(Get-FirstValue $shift @('break_length'))
                }
                $candidateMap[$id].Add($candidate)
                $allCandidates.Add($candidate)
            }
        }

        foreach ($off in @($day.time_off)) {
            $name = [string]$off.user.name
            if (-not $name) { continue }
            $id = $nameToId[$name.ToLowerInvariant()]
            if (-not $id) { continue }
            $offName = Get-TimeOffName $off
            $candidate = [pscustomobject]@{
                date=$date
                personId=$id
                personName=$Crew[$id]
                capturedAt=$capturedAt
                evidenceType='time-off'
                assignment=$offName
                assignmentCode=$null
                dutyCode=$null
                found=$true
                source='vector-api-schedule-v0.2'
                rawText=("{0} {1}" -f $name,$offName).Trim()
                shiftId=$null
                assignmentId=$null
                timeOffId=$off.id
                shiftStart=(Get-FirstValue $off @('start','start_time','starts_at'))
                shiftEnd=(Get-FirstValue $off @('end','end_time','ends_at'))
                durationHours=(Get-FirstValue $off @('real_length','length','duration'))
                breakStart=$null
                breakEnd=$null
                breakLength=$null
            }
            $candidateMap[$id].Add($candidate)
            $allCandidates.Add($candidate)
        }

        foreach ($id in $Crew.Keys) {
            $rows = @($candidateMap[$id])
            if (-not $rows.Count) {
                $observations.Add([pscustomobject]@{
                    date=$date; personId=$id; personName=$Crew[$id]; capturedAt=$capturedAt
                    assignment=$null; dutyCode=$null; found=$false; source='vector-api-schedule-v0.2'
                    rawText=''; evidenceStatus='not-found'; candidateCount=0
                })
                continue
            }

            $primary = Select-PrimaryEvidence -Rows $rows -HomeApparatus $ApparatusName
            $homeCount = @($rows | Where-Object { $_.evidenceType -eq 'assignment' -and $_.assignment -eq $ApparatusName }).Count
            $offCount = @($rows | Where-Object { $_.evidenceType -eq 'time-off' }).Count
            $otherCount = @($rows | Where-Object { $_.evidenceType -eq 'assignment' -and $_.assignment -ne $ApparatusName }).Count
            $evidenceStatus = 'single'
            if ($rows.Count -gt 1) { $evidenceStatus = 'multiple' }
            if ($homeCount -gt 0 -and $offCount -gt 0) { $evidenceStatus = 'mixed-home-and-timeoff' }
            elseif ($otherCount -gt 0 -and $offCount -gt 0) { $evidenceStatus = 'mixed-work-and-timeoff' }
            elseif ($homeCount -gt 0 -and $otherCount -gt 0) { $evidenceStatus = 'multiple-work-assignments' }

            $combinedRaw = (@($rows | ForEach-Object { $_.rawText }) -join ' || ')
            $observations.Add([pscustomobject]@{
                date=$date
                personId=$id
                personName=$Crew[$id]
                capturedAt=$capturedAt
                assignment=$primary.assignment
                dutyCode=$primary.dutyCode
                found=$true
                source='vector-api-schedule-v0.2'
                rawText=$combinedRaw
                evidenceStatus=$evidenceStatus
                candidateCount=$rows.Count
                primaryEvidenceType=$primary.evidenceType
                shiftStart=$primary.shiftStart
                shiftEnd=$primary.shiftEnd
                durationHours=$primary.durationHours
            })
        }
    }

    $allCandidates | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $candidatesPath -Encoding UTF8

    $import = [ordered]@{
        schemaVersion=2
        generatedAt=$capturedAt
        source='Vector Scheduling GET /v1/schedule read-only probe v0.2'
        acquisition=[ordered]@{
            rangeStart=$Start.ToString('yyyy-MM-dd')
            rangeEnd=$End.ToString('yyyy-MM-dd')
            etag=$etag
            rawEvidenceFile=[IO.Path]::GetFileName($rawPath)
            candidateEvidenceFile=[IO.Path]::GetFileName($candidatesPath)
        }
        settings=[ordered]@{
            apparatusName=$ApparatusName
            firefighters=@($People | Where-Object { $_.kind -eq 'firefighter' } | ForEach-Object {
                [ordered]@{id=[string]$_.id;name=[string]$_.name;kind='firefighter'}
            })
            command=@($People | Where-Object { $_.kind -eq 'command' } | ForEach-Object {
                [ordered]@{id=[string]$_.id;name=[string]$_.name;kind='command';commandRole=[string]$_.commandRole}
            })
        }
        history=@()
        dutyHistory=@()
        plans=@()
        observations=@($observations)
        reviews=@()
        resolutions=@()
    }

    $import | ConvertTo-Json -Depth 25 | Set-Content -LiteralPath $importPath -Encoding UTF8
    $observations | Select-Object date,personId,personName,dutyCode,assignment,found,evidenceStatus,candidateCount,shiftStart,shiftEnd,durationHours,source,capturedAt,rawText | `
        Export-Csv -NoTypeInformation -LiteralPath $csvPath -Encoding UTF8

    Write-Host "Raw API evidence:       $rawPath" -ForegroundColor Green
    Write-Host "Request metadata:       $metadataPath" -ForegroundColor Green
    Write-Host "Candidate evidence:     $candidatesPath" -ForegroundColor Green
    Write-Host "Helper import JSON:     $importPath" -ForegroundColor Green
    Write-Host "Readable observations:  $csvPath" -ForegroundColor Green
    Write-Host 'No Vector Scheduling data was modified.' -ForegroundColor Cyan
}
finally {
    $token = $null
    $SecureSecret = $null
    $ClientId = $null
}

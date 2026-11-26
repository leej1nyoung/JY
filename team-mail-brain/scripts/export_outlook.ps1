<#
  Outlook 메일 → JSONL 내보내기 (Python 설치 필요 없음, Windows + Outlook 만 있으면 됨)

  사용 예)
    # 지금 Outlook에 연결된 내 메일함 전체 (최근 1년)
    powershell -ExecutionPolicy Bypass -File export_outlook.ps1 -Out 이진영.jsonl

    # 특정 PST 파일
    powershell -ExecutionPolicy Bypass -File export_outlook.ps1 -Pst D:\메일\2025.pst -Out 이진영_2025.jsonl

    # 기간 지정 / Outlook에 열려 있는 모든 데이터 파일(PST 포함)
    ... -Since 2025-12-01 -AllStores

  만들어진 .jsonl 파일을 브레인 화면의 [메일 넣기]에 올리면 된다.
  파일 안에는 메일 제목·본문·주고받은 사람·첨부파일 "이름"만 들어간다 (첨부 내용은 안 들어감).
#>
param(
  [string]$Pst = "",
  [string]$Out = "",
  [string]$Since = "",
  [switch]$AllStores
)

$ErrorActionPreference = "Stop"
if (-not $Out) { $Out = Join-Path (Get-Location) ("outlook_" + (Get-Date -Format "yyyyMMdd") + ".jsonl") }
if ($Since) { $sinceDate = [datetime]::ParseExact($Since, "yyyy-MM-dd", $null) } else { $sinceDate = (Get-Date).AddDays(-366) }

$skipNames = @("Deleted Items","지운 편지함","삭제된 항목","Junk","정크","스팸","Spam","Drafts","임시 보관함",
  "Outbox","보낼 편지함","RSS","Conversation History","대화 기록","Sync Issues","동기화 문제")

$ol = New-Object -ComObject Outlook.Application
$ns = $ol.GetNamespace("MAPI")

$stores = @()
$addedRoot = $null
if ($Pst) {
  $full = (Resolve-Path $Pst).Path
  $ns.AddStoreEx($full, 1)
  foreach ($s in $ns.Stores) { if ($s.FilePath -and ($s.FilePath -ieq $full)) { $stores += $s } }
  if ($stores.Count -eq 0) { throw "Outlook에서 PST를 열지 못했습니다: $full" }
  $addedRoot = $stores[0].GetRootFolder()
} elseif ($AllStores) {
  foreach ($s in $ns.Stores) { $stores += $s }
} else {
  $stores += $ns.DefaultStore
}

$enc = New-Object System.Text.UTF8Encoding($false)
$w = New-Object System.IO.StreamWriter($Out, $false, $enc)
$script:count = 0
$PR_MSGID = "http://schemas.microsoft.com/mapi/proptag/0x1035001F"
$PR_SMTP = "http://schemas.microsoft.com/mapi/proptag/0x5D01001F"

function Skip-Folder($f) {
  foreach ($n in $skipNames) { if ($f.Name -like "*$n*") { return $true } }
  return ($f.DefaultItemType -ne 0)   # 0 = 메일 폴더. 일정·연락처·작업은 제외
}

function Export-Folder($folder, $path) {
  if (-not (Skip-Folder $folder)) {
    $items = $folder.Items
    try { $items.Sort("[ReceivedTime]", $true) } catch {}
    foreach ($it in $items) {
      try {
        if ($it.Class -ne 43) { continue }          # 43 = 메일
        $dt = $it.ReceivedTime
        if ($dt -lt $sinceDate) { break }            # 최신순 정렬이라 여기서 멈춤
        $atts = @()
        for ($i = 1; $i -le $it.Attachments.Count; $i++) { $atts += $it.Attachments.Item($i).FileName }
        $mid = ""; try { $mid = $it.PropertyAccessor.GetProperty($PR_MSGID) } catch {}
        $smtp = $it.SenderEmailAddress
        try { $smtp = $it.PropertyAccessor.GetProperty($PR_SMTP) } catch {}
        $rec = [ordered]@{
          message_id   = $mid
          subject      = $it.Subject
          sender_name  = $it.SenderName
          sender_email = $smtp
          to           = $it.To
          cc           = $it.CC
          date         = $dt.ToString("yyyy-MM-dd'T'HH:mm:ss", [System.Globalization.CultureInfo]::InvariantCulture) + "+09:00"
          folder       = $path
          body         = $it.Body
          attachments  = $atts
        }
        $w.WriteLine(($rec | ConvertTo-Json -Compress -Depth 3))
        $script:count++
        if ($script:count % 200 -eq 0) { Write-Host ("  {0}통..." -f $script:count) }
      } catch { continue }
    }
  }
  foreach ($sub in $folder.Folders) { Export-Folder $sub ($path + "/" + $sub.Name) }
}

try {
  foreach ($s in $stores) {
    Write-Host ("메일함: " + $s.DisplayName)
    $root = $s.GetRootFolder()
    Export-Folder $root $root.Name
  }
} finally {
  $w.Close()
  if ($addedRoot) { try { $ns.RemoveStore($addedRoot) } catch {} }
}
Write-Host ("완료: {0}통 → {1}" -f $script:count, $Out)
Write-Host ("기간: {0} 이후" -f $sinceDate.ToString("yyyy-MM-dd"))

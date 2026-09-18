param(
  [string]$Email
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env.local"

if (-not (Test-Path -LiteralPath $envPath)) {
  throw "没有找到 .env.local。"
}

$values = @{}

Get-Content -LiteralPath $envPath | ForEach-Object {
  if ($_ -match "^([^#=]+)=(.*)$") {
    $values[$matches[1].Trim()] = $matches[2].Trim()
  }
}

$supabaseUrl = $values["NEXT_PUBLIC_SUPABASE_URL"]
$serviceRoleKey = $values["SUPABASE_SERVICE_ROLE_KEY"]

if (-not $supabaseUrl -or -not $serviceRoleKey) {
  throw "Supabase URL 或 Service Role Key 尚未配置。"
}

$headers = @{
  apikey = $serviceRoleKey
  Authorization = "Bearer $serviceRoleKey"
  "Content-Type" = "application/json"
}

$usersResponse = Invoke-RestMethod `
  -Method Get `
  -Uri "$supabaseUrl/auth/v1/admin/users?per_page=1000" `
  -Headers $headers

$users = @($usersResponse.users)

if ($Email) {
  $user = $users | Where-Object { $_.email -eq $Email } | Select-Object -First 1
} elseif ($users.Count -eq 1) {
  $user = $users[0]
} else {
  Write-Host "检测到多个账号，请输入要设置密码的邮箱："
  $selectedEmail = Read-Host
  $user = $users | Where-Object { $_.email -eq $selectedEmail } | Select-Object -First 1
}

if (-not $user) {
  throw "没有找到要设置密码的 Supabase 用户。"
}

$securePassword = Read-Host "请输入新密码（至少 8 个字符）" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}

if ($password.Length -lt 8) {
  $password = $null
  throw "密码至少需要 8 个字符。"
}

$body = @{
  password = $password
} | ConvertTo-Json

try {
  Invoke-RestMethod `
    -Method Put `
    -Uri "$supabaseUrl/auth/v1/admin/users/$($user.id)" `
    -Headers $headers `
    -Body $body | Out-Null
} finally {
  $password = $null
  $body = $null
}

Write-Host "密码已更新。现在可以使用邮箱和新密码登录。"

param(
  [string]$Email
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env.local"

if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Could not find .env.local."
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
  throw "Supabase URL or Service Role Key is not configured."
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
  Write-Host "Multiple users found. Enter the email address:"
  $selectedEmail = Read-Host
  $user = $users | Where-Object { $_.email -eq $selectedEmail } | Select-Object -First 1
}

if (-not $user) {
  throw "Supabase user was not found."
}

$securePassword = Read-Host "Enter the new password (at least 8 characters)" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}

if ($password.Length -lt 8) {
  $password = $null
  throw "Password must contain at least 8 characters."
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

Write-Host "Password updated. You can now sign in with email and password."

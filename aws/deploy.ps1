[CmdletBinding()]
param(
  [string]$AllowedCidr,
  [string]$AlertEmail = '',
  [switch]$Execute
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$region = 'ap-southeast-1'
$profile = 'default'
$expectedAccount = '752079919261'
function Invoke-LabAws {
  param([string[]]$Command)
  $result = & aws @Command --profile $profile --region $region --no-cli-pager
  if ($LASTEXITCODE -ne 0) { throw "AWS command failed: $($Command[0]) $($Command[1])" }
  return $result
}
function Assert-NativeSuccess([string]$operation) {
  if ($LASTEXITCODE -ne 0) { throw "$operation failed" }
}
$identity = (Invoke-LabAws -Command @('sts','get-caller-identity','--output','json')) | ConvertFrom-Json
if ($identity.Account -ne $expectedAccount) { throw 'Unexpected AWS account. Stopping.' }
Write-Host "Account: $($identity.Account); identity: $($identity.Arn); region: $region"
Invoke-LabAws -Command @('cloudformation','validate-template','--template-body','file://images.json') | Out-Null
Invoke-LabAws -Command @('cloudformation','validate-template','--template-body','file://runtime.json') | Out-Null
if (-not $Execute) {
  Write-Host 'PLAN ONLY: templates validated; no resources created.'
  Write-Host 'Creates two lab stacks: devops-practice-images and devops-practice-runtime.'
  Write-Host 'Runtime: new VPC, two public subnets, ALB, one 0.5 vCPU/2 GB Fargate task, API + temporary MongoDB, logs, dashboard, SNS, alarms.'
  Write-Host 'Charges continue while resources exist. HTTP access is restricted to your supplied public IPv4 /32. No company data.'
  Write-Host 'MongoDB data is erased on task replacement. Read aws/README.md before execution.'
  Write-Host 'Run with -Execute -AllowedCidr YOUR_PUBLIC_IPV4/32 and optionally -AlertEmail YOUR_EMAIL.'
  exit 0
}
if ($AllowedCidr -notmatch '^([0-9]{1,3}\.){3}[0-9]{1,3}/32$') { throw 'AllowedCidr must be your approved public IPv4 /32.' }
$ip = $null
if (-not [System.Net.IPAddress]::TryParse(($AllowedCidr -split '/')[0], [ref]$ip) -or $ip.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { throw 'Invalid IPv4 address.' }
# Refuse to update stacks that are not marked as this lab.
$existing = (Invoke-LabAws -Command @('cloudformation','describe-stacks','--output','json')) | ConvertFrom-Json
foreach ($name in @('devops-practice-images','devops-practice-runtime')) {
  $stack = @($existing.Stacks | Where-Object { $_.StackName -eq $name })
  if ($stack.Count -gt 0 -and @($stack[0].Tags | Where-Object { $_.Key -eq 'Project' -and $_.Value -eq 'devops-practice-core' }).Count -eq 0) { throw "Refusing to modify unrecognised stack $name" }
}
Invoke-LabAws -Command @('cloudformation','deploy','--stack-name','devops-practice-images','--template-file','images.json','--tags','Project=devops-practice-core','--no-fail-on-empty-changeset')
$registry = "$expectedAccount.dkr.ecr.$region.amazonaws.com"
$password = Invoke-LabAws -Command @('ecr','get-login-password')
$password | docker login --username AWS --password-stdin $registry
Assert-NativeSuccess 'Docker registry login'
Remove-Variable password
$version = (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss')
$apiImage = "${registry}/devops-practice-core:$version"
$mongoImage = "${registry}/devops-practice-mongo:$version"
Push-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
try {
  docker build --platform linux/amd64 -t $apiImage .
  Assert-NativeSuccess 'API image build'
  docker push $apiImage
  Assert-NativeSuccess 'API image push'
  docker pull --platform linux/amd64 mongo:8.0
  Assert-NativeSuccess 'MongoDB image pull'
  docker tag mongo:8.0 $mongoImage
  Assert-NativeSuccess 'MongoDB image tag'
  docker push $mongoImage
  Assert-NativeSuccess 'MongoDB image push'
} finally { Pop-Location }
$parameters = @("ApiImage=$apiImage", "MongoImage=$mongoImage", "Version=$version", "AllowedCidr=$AllowedCidr")
if ($AlertEmail) { $parameters += "AlertEmail=$AlertEmail" }
Invoke-LabAws -Command (@('cloudformation','deploy','--stack-name','devops-practice-runtime','--template-file','runtime.json','--capabilities','CAPABILITY_IAM','--tags','Project=devops-practice-core','--no-fail-on-empty-changeset','--parameter-overrides') + $parameters)
Invoke-LabAws -Command @('cloudformation','describe-stacks','--stack-name','devops-practice-runtime','--query','Stacks[0].Outputs','--output','table')
Write-Host 'Confirm the SNS email subscription if supplied. Delete the lab with cleanup.ps1 after practice.'

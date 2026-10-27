[CmdletBinding()]
param([switch]$Execute)
$ErrorActionPreference = 'Stop'
$region = 'ap-southeast-1'
$profile = 'default'
function Invoke-LabAws {
  param([string[]]$Command)
  $result = & aws @Command --profile $profile --region $region --no-cli-pager
  if ($LASTEXITCODE -ne 0) { throw "AWS command failed: $($Command[0]) $($Command[1])" }
  return $result
}
$identity = (Invoke-LabAws -Command @('sts','get-caller-identity','--output','json')) | ConvertFrom-Json
if ($identity.Account -ne '752079919261') { throw 'Unexpected account. Stopping.' }
$existing = (Invoke-LabAws -Command @('cloudformation','describe-stacks','--output','json')) | ConvertFrom-Json
$targets = @()
foreach ($name in @('devops-practice-runtime','devops-practice-images')) {
  $stack = @($existing.Stacks | Where-Object { $_.StackName -eq $name })
  if ($stack.Count -eq 0) { Write-Host "$name does not exist; skipping."; continue }
  if (@($stack[0].Tags | Where-Object { $_.Key -eq 'Project' -and $_.Value -eq 'devops-practice-core' }).Count -eq 0) { throw "Refusing to delete unrecognised stack $name" }
  $targets += $stack[0]
}
Write-Host "Account $($identity.Account), region $region. Targets: $($targets.StackName -join ', ')"
if (-not $Execute) { Write-Host 'PLAN ONLY. -Execute deletes the lab, its dummy database, logs, alarms and ECR images.'; exit 0 }
foreach ($stack in $targets) {
  Invoke-LabAws -Command @('cloudformation','delete-stack','--stack-name',$stack.StackId)
  Invoke-LabAws -Command @('cloudformation','wait','stack-delete-complete','--stack-name',$stack.StackId)
  Write-Host "Deleted $($stack.StackName)"
}
Write-Host 'Lab stack deletion complete. Check Billing for remaining usage. Local files and Docker containers remain.'

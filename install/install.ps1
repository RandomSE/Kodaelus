#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$InstructionsSrc = Join-Path $RepoRoot "kodaelus\instructions.md"
$TemplateAgent = Join-Path $PSScriptRoot "templates\kodaelus.agent.md"
$TemplateSkill = Join-Path $PSScriptRoot "templates\kodaelus.skill.md"

$CursorHome = Join-Path $env:USERPROFILE ".cursor"
$GlobalKodaelus = Join-Path $CursorHome "kodaelus"
$AgentsDir = Join-Path $CursorHome "agents"
$SkillsDir = Join-Path $CursorHome "skills\kodaelus"

if (-not (Test-Path $InstructionsSrc)) {
    throw "Missing source instructions: $InstructionsSrc"
}

$instructions = Get-Content -Path $InstructionsSrc -Raw -Encoding UTF8
$agentTemplate = Get-Content -Path $TemplateAgent -Raw -Encoding UTF8
$agentBody = $agentTemplate.Replace("{{INSTRUCTIONS}}", $instructions.TrimEnd())

New-Item -ItemType Directory -Force -Path $GlobalKodaelus | Out-Null
New-Item -ItemType Directory -Force -Path $AgentsDir | Out-Null
New-Item -ItemType Directory -Force -Path $SkillsDir | Out-Null

$instructionsDest = Join-Path $GlobalKodaelus "instructions.md"
$agentDest = Join-Path $AgentsDir "kodaelus.md"
$skillDest = Join-Path $SkillsDir "SKILL.md"

Set-Content -Path $instructionsDest -Value $instructions -Encoding UTF8 -NoNewline
Set-Content -Path $agentDest -Value $agentBody -Encoding UTF8 -NoNewline
Copy-Item -Path $TemplateSkill -Destination $skillDest -Force

Write-Host "Kodaelus installed for all Cursor projects."
Write-Host "  Instructions: $instructionsDest"
Write-Host "  Subagent:     $agentDest"
Write-Host "  Skill:        $skillDest"
Write-Host ""
Write-Host "In any project: pick the Kodaelus subagent from the agent menu, or ask to use Kodaelus."
Write-Host "Re-run this script after updating instructions in the Kodaelus repo."

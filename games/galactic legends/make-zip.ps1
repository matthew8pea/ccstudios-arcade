# Builds GalacticLegends.zip for itch.io: only the files the game loads, with
# index.html at the top of the zip, which is where itch.io looks for it.
# Double-click make-zip.bat to run it; the zip lands in your Downloads folder
# and replaces the previous one there.
#
# The list below is an allow-list rather than "everything except". The dev
# tools (smoke.js, validate.js, CLAUDE.md, devlog.md, fortnite-pack.js, .vscode,
# this script) stay out without anyone having to remember them, and a new dev
# file can never leak into an upload. The cost runs the other way: a NEW file
# the game loads has to be added here. The index.html check below catches the
# usual case of that, a new <script> or <link> tag.
#
# Entries are written one at a time with forward slashes. Compress-Archive in
# Windows PowerShell 5.1 writes backslashes, which a Linux web server (itch.io's)
# can take as part of the file name, and then "sounds/Blaster.mp3" is not found.
#
# ASCII only in this file: PowerShell 5.1 reads a .ps1 without a BOM as ANSI.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# Downloads is asked of Windows rather than assumed to be USERPROFILE\Downloads,
# because it can be moved (to OneDrive or another drive) and the old path then
# still exists but is not the folder the owner opens.
$downloads = $null
try { $downloads = (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path } catch {}
if (-not $downloads) { $downloads = Join-Path $env:USERPROFILE 'Downloads' }
$zipPath = Join-Path $downloads 'GalacticLegends.zip'

$files   = @('index.html', 'game.js', 'styles.css', 'sprite-kit.js', 'snap-intro.js', 'favicon.png')
$folders = @('sounds', 'music', 'aurebesh', 'fonts')

function Fail($msg) {
    Write-Host ''
    Write-Host "FAILED - $msg" -ForegroundColor Red
    Write-Host 'No zip was made.'
    exit 1
}

$missing = @(($files + $folders) | Where-Object { -not (Test-Path (Join-Path $root $_)) })
if ($missing.Count) { Fail ("missing from the game folder: " + ($missing -join ', ')) }

# Everything index.html loads from this folder must be in the zip. Links with a
# ':' (the Google Fonts URL) are off-site, and ?v=N cache-busts are stripped.
$html = Get-Content (Join-Path $root 'index.html') -Raw
$refs = [regex]::Matches($html, '(?:src|href)="([^"#?]*)') | ForEach-Object { $_.Groups[1].Value } |
    Where-Object { $_ -and $_ -notmatch ':' } | Sort-Object -Unique
$unpacked = @($refs | Where-Object {
    $ref = $_
    -not ($files -contains $ref) -and -not ($folders | Where-Object { $ref.StartsWith("$_/") })
})
if ($unpacked.Count) {
    Fail ("index.html loads files this script does not pack: " + ($unpacked -join ', ') + ". Add them to the list at the top of make-zip.ps1.")
}

$entries = @()
foreach ($f in $files) {
    $entries += [pscustomobject]@{ Full = (Join-Path $root $f); Name = $f }
}
foreach ($d in $folders) {
    Get-ChildItem -Path (Join-Path $root $d) -File -Recurse | ForEach-Object {
        $entries += [pscustomobject]@{
            Full = $_.FullName
            Name = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
        }
    }
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
    foreach ($e in $entries) {
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $e.Full, $e.Name, 'Optimal')
    }
} finally {
    $zip.Dispose()
}

$mb = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host ''
Write-Host "Made GalacticLegends.zip  ($($entries.Count) files, $mb MB)" -ForegroundColor Green
Write-Host $zipPath

$port     = 8080
$root     = $PSScriptRoot
$dataDir  = Join-Path $root "data"
$filesDir = Join-Path $dataDir "files"
$ordersFile = Join-Path $dataDir "orders.json"

if (-not (Test-Path $dataDir))  { New-Item -ItemType Directory -Path $dataDir  | Out-Null }
if (-not (Test-Path $filesDir)) { New-Item -ItemType Directory -Path $filesDir | Out-Null }

$listener = [System.Net.HttpListener]::new()
try {
    $listener.Prefixes.Add("http://localhost:$port/")
    $listener.Start()
} catch {
    exit 0   # already running — VBS will just open the browser
}

$mimes = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'
    '.gif'  = 'image/gif'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'
    '.pdf'  = 'application/pdf'; '.zip' = 'application/zip'
}

function Write-Json($ctx, $status, $body) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $ctx.Response.StatusCode      = $status
    $ctx.Response.ContentType     = 'application/json; charset=utf-8'
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.OutputStream.Close()
}

function Read-Body($ctx) {
    $ms = [System.IO.MemoryStream]::new()
    $ctx.Request.InputStream.CopyTo($ms)
    return $ms.ToArray()
}

while ($listener.IsListening) {
    try {
        $ctx    = $listener.GetContext()
        $method = $ctx.Request.HttpMethod
        $path   = $ctx.Request.Url.LocalPath

        # ── OPTIONS preflight ──────────────────────────────────────
        if ($method -eq 'OPTIONS') {
            $ctx.Response.Headers.Add('Access-Control-Allow-Origin',  '*')
            $ctx.Response.Headers.Add('Access-Control-Allow-Methods', 'GET,POST,DELETE')
            $ctx.Response.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
            $ctx.Response.StatusCode = 204
            $ctx.Response.OutputStream.Close()
            continue
        }

        # ── GET /api/orders ────────────────────────────────────────
        if ($path -eq '/api/orders' -and $method -eq 'GET') {
            $content = if (Test-Path $ordersFile) { Get-Content $ordersFile -Raw -Encoding UTF8 } else { '[]' }
            Write-Json $ctx 200 $content
        }

        # ── POST /api/orders ───────────────────────────────────────
        elseif ($path -eq '/api/orders' -and $method -eq 'POST') {
            $bytes = Read-Body $ctx
            [System.IO.File]::WriteAllBytes($ordersFile, $bytes)
            Write-Json $ctx 200 '{"ok":true}'
        }

        # ── GET /api/files/<fname> ─────────────────────────────────
        elseif ($path -match '^/api/files/(.+)$' -and $method -eq 'GET') {
            $fpath = Join-Path $filesDir $Matches[1]
            if (Test-Path $fpath -PathType Leaf) {
                $bytes = [System.IO.File]::ReadAllBytes($fpath)
                $ext   = [System.IO.Path]::GetExtension($fpath).ToLower()
                $ctx.Response.ContentType     = if ($mimes[$ext]) { $mimes[$ext] } else { 'application/octet-stream' }
                $ctx.Response.ContentLength64 = $bytes.Length
                $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
                $ctx.Response.Headers.Add('Content-Disposition', "attachment; filename*=UTF-8''" + [Uri]::EscapeDataString([System.IO.Path]::GetFileName($fpath)))
                $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
                $ctx.Response.OutputStream.Close()
            } else { Write-Json $ctx 404 '{"error":"not found"}' }
        }

        # ── POST /api/files/<fname> ────────────────────────────────
        elseif ($path -match '^/api/files/(.+)$' -and $method -eq 'POST') {
            $fpath = Join-Path $filesDir $Matches[1]
            [System.IO.File]::WriteAllBytes($fpath, (Read-Body $ctx))
            Write-Json $ctx 200 '{"ok":true}'
        }

        # ── DELETE /api/files/<fname> ──────────────────────────────
        elseif ($path -match '^/api/files/(.+)$' -and $method -eq 'DELETE') {
            $fpath = Join-Path $filesDir $Matches[1]
            if (Test-Path $fpath) { Remove-Item $fpath -Force }
            Write-Json $ctx 200 '{"ok":true}'
        }

        # ── DELETE /api/files  (clear all) ────────────────────────
        elseif ($path -eq '/api/files' -and $method -eq 'DELETE') {
            Get-ChildItem $filesDir -File | Remove-Item -Force
            Write-Json $ctx 200 '{"ok":true}'
        }

        # ── Static file serving ────────────────────────────────────
        else {
            $p = $path.TrimStart('/')
            if ($p -eq '') { $p = 'index.html' }
            $f = Join-Path $root $p
            if (Test-Path $f -PathType Leaf) {
                $bytes = [System.IO.File]::ReadAllBytes($f)
                $ext   = [System.IO.Path]::GetExtension($f).ToLower()
                $ctx.Response.ContentType     = if ($mimes[$ext]) { $mimes[$ext] } else { 'application/octet-stream' }
                $ctx.Response.ContentLength64 = $bytes.Length
                $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
                $ctx.Response.OutputStream.Close()
            } else { Write-Json $ctx 404 '{"error":"not found"}' }
        }
    } catch {}
}

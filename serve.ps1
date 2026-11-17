# Minimal static file server for local preview: powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8080]
# Serves this folder only, and never its hidden files or folders (.git, .claude).
param([int]$Port = 8080)

$ErrorActionPreference = "Stop"

# The served folder, with a trailing separator, so that a sibling folder whose name merely starts the same
# (e.g. "westirol-old" next to "westirol") does not count as inside it.
$separator = [IO.Path]::DirectorySeparatorChar
$root = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd($separator) + $separator

$types = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".txt"  = "text/plain; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
}

# The full path of the file to serve for a URL path, or $null when it lies outside the folder or is hidden.
function Resolve-ServedPath([string]$urlPath) {
  # Unescaping can turn "%2F" into "/", so "..%2F" climbs out; GetFullPath resolves it, the check below catches it.
  $rel = [Uri]::UnescapeDataString($urlPath).TrimStart("/")
  if ($rel -eq "") {
    $rel = "index.html"
  }
  $path = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $rel))
  if (-not $path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
    return $null
  }
  # Hidden files and folders are never served, not even by their 8.3 short name (e.g. GIT~1 for .git).
  $segments = $path.Substring($root.Length).Split([char[]]@("\", "/"))
  if ($segments | Where-Object { $_.StartsWith(".") -or $_.Contains("~") }) {
    return $null
  }
  return $path
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
  $listener.Start()
} catch {
  Write-Host "Could not listen on port ${Port}: is the server already running? Pick another with -Port."
  exit 1
}
Write-Host "Serving $root at http://localhost:$Port/  (Ctrl+C to stop)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $path = Resolve-ServedPath $ctx.Request.Url.AbsolutePath
      if ($path -and [IO.File]::Exists($path)) {
        $bytes = [IO.File]::ReadAllBytes($path)
        $ext = [IO.Path]::GetExtension($path).ToLower()
        if ($types.ContainsKey($ext)) {
          $ctx.Response.ContentType = $types[$ext]
        }
        $ctx.Response.ContentLength64 = $bytes.Length
        if ($ctx.Request.HttpMethod -ne "HEAD") {
          $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
      } else {
        $ctx.Response.StatusCode = 404
      }
    } catch {
      # Malformed paths (invalid characters, "file::stream") end up here.
      Write-Host "Request failed: $_"
      try {
        $ctx.Response.StatusCode = 400
      } catch {
        # Too late once the response has started.
      }
    } finally {
      try {
        $ctx.Response.Close()
      } catch {
        # The client went away.
      }
    }
  }
} finally {
  $listener.Stop()
}

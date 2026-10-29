# Kleiner lokaler Webserver zum Testen der App am PC: http://localhost:8080
param([int]$Port = 8080)

$wurzel = $PSScriptRoot
$typen = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.webmanifest' = 'application/manifest+json'; '.png' = 'image/png'; '.svg' = 'image/svg+xml'; '.md' = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "App läuft auf http://localhost:$Port/  (Beenden mit Strg+C)"

while ($listener.IsListening) {
  $kontext = $listener.GetContext()
  $pfad = [Uri]::UnescapeDataString($kontext.Request.Url.AbsolutePath).TrimStart('/')
  if ($pfad -eq '') { $pfad = 'index.html' }
  $datei = [IO.Path]::GetFullPath((Join-Path $wurzel $pfad))
  $antwort = $kontext.Response
  if ($datei.StartsWith($wurzel) -and (Test-Path $datei -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($datei)
    $typ = $typen[[IO.Path]::GetExtension($datei)]
    $antwort.ContentType = if ($typ) { $typ } else { 'application/octet-stream' }
    $antwort.ContentLength64 = $bytes.Length
    $antwort.Headers.Add('Cache-Control', 'no-cache')
    $antwort.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $antwort.StatusCode = 404
  }
  $antwort.Close()
}

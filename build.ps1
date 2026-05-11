Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue

New-Item -ItemType Directory -Path dist/chrome, dist/firefox | Out-Null

Copy-Item -Recurse src/* dist/chrome/
Copy-Item manifest.chrome.json dist/chrome/manifest.json

Copy-Item -Recurse src/* dist/firefox/
Copy-Item manifest.firefox.json dist/firefox/manifest.json

Write-Host "Done! Load dist/chrome in Chrome, dist/firefox in Firefox."
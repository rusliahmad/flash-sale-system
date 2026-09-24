$base = "http://localhost:4000"

Write-Host "--- GET /health ---"
Invoke-RestMethod "$base/health" | ConvertTo-Json

Write-Host "--- GET /api/sale ---"
Invoke-RestMethod "$base/api/sale" | ConvertTo-Json

Write-Host "--- POST /api/purchase ---"
try {
  Invoke-RestMethod "$base/api/purchase" -Method Post -ContentType "application/json" -Body '{"userId":"user-1"}' | ConvertTo-Json
} catch {
  Write-Host "Status: $($_.Exception.Response.StatusCode.value__)"
  Write-Host $_.ErrorDetails.Message
}

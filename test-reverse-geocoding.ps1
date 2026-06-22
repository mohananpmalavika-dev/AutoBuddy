# Test script for reverse geocoding endpoint
# Tests both local and production endpoints

param(
    [string]$Environment = "local",  # local or production
    [string]$Host = "http://localhost:8000"
)

function Test-ReverseGeocodeEndpoint {
    param(
        [string]$Latitude,
        [string]$Longitude,
        [string]$Language = "en"
    )
    
    $url = "$Host/api/places/reverse-geocode?latitude=$Latitude&longitude=$Longitude&language=$Language"
    
    Write-Host "Testing: $url" -ForegroundColor Cyan
    
    try {
        $response = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 10 -ErrorAction Stop
        $data = $response.Content | ConvertFrom-Json
        Write-Host "✓ Status: $($response.StatusCode)" -ForegroundColor Green
        Write-Host "  Response: $($data.address)" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "✗ Error: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
        Write-Host "  Details: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Test function end

# Test cases
Write-Host "`n=== Reverse Geocoding Endpoint Tests ===" -ForegroundColor Yellow
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host "Host: $Host`n" -ForegroundColor Yellow

$tests = @(
    @{ Lat = "8.897017"; Lon = "76.565663"; Desc = "Kochi, Kerala" },
    @{ Lat = "8.5241"; Lon = "76.9366"; Desc = "Thiruvananthapuram" },
    @{ Lat = "9.5404"; Lon = "76.2605"; Desc = "Kollam" },
    @{ Lat = "0"; Lon = "0"; Desc = "Equator, Prime Meridian" },
)

$passed = 0
$failed = 0

foreach ($test in $tests) {
    Write-Host "`nTest: $($test.Desc)" -ForegroundColor Magenta
    if (Test-ReverseGeocodeEndpoint -Latitude $test.Lat -Longitude $test.Lon) {
        $passed++
    } else {
        $failed++
    }
}

# Summary
Write-Host "`n=== Test Summary ===" -ForegroundColor Yellow
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor Red
Write-Host "Total: $($passed + $failed)" -ForegroundColor Yellow

if ($failed -eq 0) {
    Write-Host "`n✓ All tests passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n✗ Some tests failed!" -ForegroundColor Red
    exit 1
}

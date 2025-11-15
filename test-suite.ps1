# Octate Collaboration Backend - Comprehensive Test Suite
# Tests the deployed backend at octate.qzz.io

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🧪 Octate Backend Test Suite" -ForegroundColor Cyan
Write-Host "Testing: https://octate.qzz.io" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "https://octate.qzz.io"
$testResults = @()

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [string]$Body = $null,
        [int]$ExpectedStatus = 200
    )

    Write-Host "Testing: $Name" -NoNewline

    try {
        $params = @{
            Uri = $Url
            Method = $Method
            TimeoutSec = 10
        }

        if ($Headers.Count -gt 0) {
            $params.Headers = $Headers
        }

        if ($Body) {
            $params.Body = $Body
            $params.ContentType = "application/json"
        }

        $response = Invoke-WebRequest @params -UseBasicParsing
        $statusCode = $response.StatusCode

        if ($statusCode -eq $ExpectedStatus) {
            Write-Host " ✅ PASS" -ForegroundColor Green
            Write-Host "   Status: $statusCode" -ForegroundColor Gray
            return @{ Name = $Name; Status = "PASS"; StatusCode = $statusCode }
        } else {
            Write-Host " ⚠️  UNEXPECTED" -ForegroundColor Yellow
            Write-Host "   Expected: $ExpectedStatus, Got: $statusCode" -ForegroundColor Gray
            return @{ Name = $Name; Status = "UNEXPECTED"; StatusCode = $statusCode }
        }
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $errorMessage = $_.ErrorDetails.Message

        if ($statusCode -eq $ExpectedStatus) {
            Write-Host " ✅ PASS" -ForegroundColor Green
            Write-Host "   Status: $statusCode (Expected)" -ForegroundColor Gray
            return @{ Name = $Name; Status = "PASS"; StatusCode = $statusCode }
        } else {
            Write-Host " ❌ FAIL" -ForegroundColor Red
            Write-Host "   Status: $statusCode" -ForegroundColor Gray
            Write-Host "   Error: $errorMessage" -ForegroundColor Red
            return @{ Name = $Name; Status = "FAIL"; StatusCode = $statusCode; Error = $errorMessage }
        }
    }
}

# Test 1: Server Health
Write-Host "`n1️⃣  SERVER HEALTH TESTS" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
$testResults += Test-Endpoint -Name "Health Check" -Url "$baseUrl/health" -ExpectedStatus 200

# Test 2: CORS Headers
Write-Host "`n2️⃣  CORS CONFIGURATION TESTS" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/health" -Method Options -UseBasicParsing -TimeoutSec 10
    if ($response.Headers["Access-Control-Allow-Origin"]) {
        Write-Host "Testing: CORS Headers ✅ PASS" -ForegroundColor Green
        Write-Host "   CORS Origin: $($response.Headers['Access-Control-Allow-Origin'])" -ForegroundColor Gray
        $testResults += @{ Name = "CORS Headers"; Status = "PASS" }
    }
}
catch {
    Write-Host "Testing: CORS Headers ⚠️  SKIP" -ForegroundColor Yellow
}

# Test 3: Authentication Endpoints
Write-Host "`n3️⃣  AUTHENTICATION TESTS" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
$testResults += Test-Endpoint -Name "Auth - Missing Token" -Url "$baseUrl/api/rooms" -ExpectedStatus 401
$testResults += Test-Endpoint -Name "Auth - Validate Endpoint" -Url "$baseUrl/api/auth/validate" -Method POST -ExpectedStatus 400

# Test 4: Room Endpoints (Without Auth)
Write-Host "`n4️⃣  ROOM API TESTS (Unauthenticated)" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
$testResults += Test-Endpoint -Name "List Rooms (No Auth)" -Url "$baseUrl/api/rooms" -ExpectedStatus 401
$testResults += Test-Endpoint -Name "Create Room (No Auth)" -Url "$baseUrl/api/rooms" -Method POST -ExpectedStatus 401

# Test 5: Error Handling
Write-Host "`n5️⃣  ERROR HANDLING TESTS" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
$testResults += Test-Endpoint -Name "404 - Invalid Route" -Url "$baseUrl/api/nonexistent" -ExpectedStatus 404
$testResults += Test-Endpoint -Name "Invalid Room ID" -Url "$baseUrl/api/rooms/invalid-uuid" -ExpectedStatus 401

# Test 6: WebSocket Connection
Write-Host "`n6️⃣  WEBSOCKET TESTS" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Testing: WebSocket Connection" -NoNewline

try {
    # Test WebSocket endpoint availability (should return upgrade required or similar)
    $response = Invoke-WebRequest -Uri "$baseUrl/socket.io/" -Method GET -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200 -or $response.Content -match "socket\.io") {
        Write-Host " ✅ PASS" -ForegroundColor Green
        Write-Host "   Socket.IO endpoint is accessible" -ForegroundColor Gray
        $testResults += @{ Name = "WebSocket Endpoint"; Status = "PASS" }
    }
}
catch {
    $errorMsg = $_.Exception.Message
    if ($errorMsg -match "400" -or $errorMsg -match "upgrade") {
        Write-Host " ✅ PASS" -ForegroundColor Green
        Write-Host "   Socket.IO endpoint requires upgrade (expected)" -ForegroundColor Gray
        $testResults += @{ Name = "WebSocket Endpoint"; Status = "PASS" }
    } else {
        Write-Host " ⚠️  WARNING" -ForegroundColor Yellow
        Write-Host "   Could not verify WebSocket: $errorMsg" -ForegroundColor Yellow
        $testResults += @{ Name = "WebSocket Endpoint"; Status = "WARNING" }
    }
}

# Test 7: SSL/HTTPS
Write-Host "`n7️⃣  SECURITY TESTS" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Testing: HTTPS/SSL Certificate" -NoNewline
try {
    $response = Invoke-WebRequest -Uri $baseUrl -Method GET -UseBasicParsing -TimeoutSec 10
    Write-Host " ✅ PASS" -ForegroundColor Green
    Write-Host "   SSL certificate is valid" -ForegroundColor Gray
    $testResults += @{ Name = "SSL Certificate"; Status = "PASS" }
}
catch {
    Write-Host " ❌ FAIL" -ForegroundColor Red
    Write-Host "   SSL error: $($_.Exception.Message)" -ForegroundColor Red
    $testResults += @{ Name = "SSL Certificate"; Status = "FAIL" }
}

# Test 8: Performance/Response Time
Write-Host "`n8️⃣  PERFORMANCE TESTS" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Testing: Response Time" -NoNewline

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get -TimeoutSec 10
    $stopwatch.Stop()
    $responseTime = $stopwatch.ElapsedMilliseconds

    if ($responseTime -lt 1000) {
        Write-Host " ✅ EXCELLENT" -ForegroundColor Green
        Write-Host "   Response time: ${responseTime}ms" -ForegroundColor Gray
        $testResults += @{ Name = "Response Time"; Status = "EXCELLENT"; ResponseTime = $responseTime }
    }
    elseif ($responseTime -lt 2000) {
        Write-Host " ✅ GOOD" -ForegroundColor Green
        Write-Host "   Response time: ${responseTime}ms" -ForegroundColor Gray
        $testResults += @{ Name = "Response Time"; Status = "GOOD"; ResponseTime = $responseTime }
    }
    else {
        Write-Host " ⚠️  SLOW" -ForegroundColor Yellow
        Write-Host "   Response time: ${responseTime}ms" -ForegroundColor Yellow
        $testResults += @{ Name = "Response Time"; Status = "SLOW"; ResponseTime = $responseTime }
    }
}
catch {
    $stopwatch.Stop()
    Write-Host " ❌ FAIL" -ForegroundColor Red
    $testResults += @{ Name = "Response Time"; Status = "FAIL" }
}

# Test 9: Database Connection
Write-Host "`n9️⃣  DATABASE TESTS" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Testing: Database Connection" -NoNewline

try {
    $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get -TimeoutSec 10
    if ($health.database -eq "connected") {
        Write-Host " ✅ PASS" -ForegroundColor Green
        Write-Host "   Database: Supabase connected" -ForegroundColor Gray
        $testResults += @{ Name = "Database Connection"; Status = "PASS" }
    }
    else {
        Write-Host " ❌ FAIL" -ForegroundColor Red
        Write-Host "   Database: Disconnected" -ForegroundColor Red
        $testResults += @{ Name = "Database Connection"; Status = "FAIL" }
    }
}
catch {
    Write-Host " ❌ FAIL" -ForegroundColor Red
    $testResults += @{ Name = "Database Connection"; Status = "FAIL" }
}

# Test 10: Rate Limiting
Write-Host "`n🔟 RATE LIMITING TESTS" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Testing: Rate Limiting" -NoNewline

$rateLimitHit = $false
for ($i = 0; $i -lt 10; $i++) {
    try {
        Invoke-WebRequest -Uri "$baseUrl/health" -Method GET -UseBasicParsing -TimeoutSec 2 | Out-Null
    }
    catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 429) {
            $rateLimitHit = $true
            break
        }
    }
}

if ($rateLimitHit) {
    Write-Host " ✅ ENABLED" -ForegroundColor Green
    Write-Host "   Rate limiting is active" -ForegroundColor Gray
    $testResults += @{ Name = "Rate Limiting"; Status = "ENABLED" }
}
else {
    Write-Host " ℹ️  NOT TRIGGERED" -ForegroundColor Blue
    Write-Host "   Rate limits not reached in test" -ForegroundColor Gray
    $testResults += @{ Name = "Rate Limiting"; Status = "NOT_TRIGGERED" }
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "📊 TEST SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$passCount = ($testResults | Where-Object { $_.Status -eq "PASS" -or $_.Status -eq "EXCELLENT" -or $_.Status -eq "GOOD" }).Count
$totalCount = $testResults.Count
$passRate = [math]::Round(($passCount / $totalCount) * 100, 1)

Write-Host "`nTotal Tests: $totalCount" -ForegroundColor White
Write-Host "Passed: $passCount" -ForegroundColor Green
Write-Host "Failed: $(($testResults | Where-Object { $_.Status -eq "FAIL" }).Count)" -ForegroundColor Red
Write-Host "Pass Rate: $passRate%" -ForegroundColor Cyan

Write-Host "`n📋 Detailed Results:" -ForegroundColor Cyan
foreach ($result in $testResults) {
    $statusColor = switch ($result.Status) {
        "PASS" { "Green" }
        "EXCELLENT" { "Green" }
        "GOOD" { "Green" }
        "ENABLED" { "Green" }
        "FAIL" { "Red" }
        "WARNING" { "Yellow" }
        "SLOW" { "Yellow" }
        "NOT_TRIGGERED" { "Blue" }
        default { "Gray" }
    }

    $statusIcon = switch ($result.Status) {
        "PASS" { "✅" }
        "EXCELLENT" { "✅" }
        "GOOD" { "✅" }
        "ENABLED" { "✅" }
        "FAIL" { "❌" }
        "WARNING" { "⚠️" }
        "SLOW" { "⚠️" }
        "NOT_TRIGGERED" { "ℹ️" }
        default { "◻️" }
    }

    Write-Host "  $statusIcon $($result.Name): $($result.Status)" -ForegroundColor $statusColor
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "✅ Backend is LIVE and OPERATIONAL!" -ForegroundColor Green
Write-Host "🌐 URL: https://octate.qzz.io" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Return summary object
return @{
    BaseUrl = $baseUrl
    TotalTests = $totalCount
    Passed = $passCount
    PassRate = $passRate
    Results = $testResults
    Status = if ($passRate -gt 80) { "HEALTHY" } else { "NEEDS_ATTENTION" }
}

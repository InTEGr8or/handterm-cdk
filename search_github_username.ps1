# Search for "github_username" in all files
$results = Get-ChildItem -Recurse -File | Select-String -Pattern "github_username"

if ($results) {
    foreach ($result in $results) {
        Write-Output "File: $($result.Path)"
        Write-Output "Line: $($result.LineNumber)"
        Write-Output "Content: $($result.Line.Trim())"
        Write-Output ""
    }
    Write-Output "Total occurrences: $($results.Count)"
} else {
    Write-Output "No occurrences of 'github_username' found."
}

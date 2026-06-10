param(
    [Parameter(Mandatory = $true)]
    [string]$WorkbookPath,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

function Get-CellText($Sheet, [int]$Row, [int]$Col) {
    $value = $Sheet.Cells.Item($Row, $Col).Text
    if ($null -eq $value) { return '' }
    return [string]$value
}

function Get-CellValue($Sheet, [int]$Row, [int]$Col) {
    $value = $Sheet.Cells.Item($Row, $Col).Value2
    if ($null -eq $value -or $value -eq '') { return $null }
    return $value
}

function Get-CellFormula($Sheet, [int]$Row, [int]$Col) {
    $cell = $Sheet.Cells.Item($Row, $Col)
    if ($cell.HasFormula) { return [string]$cell.Formula }
    return $null
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
    $wb = $excel.Workbooks.Open($WorkbookPath, $null, $true)

    $sum = $wb.Worksheets.Item('sum')
    $mapping = $wb.Worksheets.Item('mapping PnL')
    $guide = $wb.Worksheets.Item('Guide')

    $periods = @()
    # Sheet sum has a second derived %Sales block from N:U. The actual/forecast
    # values used as benchmark are the first period block D:J.
    for ($col = 4; $col -le 10; $col++) {
        $period = Get-CellValue $sum 9 $col
        $type = Get-CellText $sum 8 $col
        if ($period -and $type) {
            $periods += [ordered]@{
                column = $col
                period = [int]$period
                type = $type
            }
        }
    }

    $sumRows = @()
    for ($row = 10; $row -le 60; $row++) {
        $code = (Get-CellText $sum $row 2).Trim()
        if (-not $code) { continue }
        $values = [ordered]@{}
        $formulas = [ordered]@{}
        foreach ($p in $periods) {
            $v = Get-CellValue $sum $row $p.column
            if ($null -ne $v -and $v -ne '') {
                $values[[string]$p.period] = [double]$v
            }
            $f = Get-CellFormula $sum $row $p.column
            if ($f) {
                $formulas[[string]$p.period] = $f
            }
        }
        $sumRows += [ordered]@{
            row = $row
            index = Get-CellValue $sum $row 1
            item_code = $code
            short_name = Get-CellText $sum $row 3
            values = $values
            formulas = $formulas
        }
    }

    $mappingRows = @()
    $mappingUsed = $mapping.UsedRange
    for ($row = 2; $row -le $mappingUsed.Rows.Count; $row++) {
        $code = (Get-CellText $mapping $row 2).Trim()
        if (-not $code) { continue }
        $mappingRows += [ordered]@{
            item_code = $code
            item_name = Get-CellText $mapping $row 3
            short_name = Get-CellText $mapping $row 4
        }
    }

    $guideRows = @()
    $guideUsed = $guide.UsedRange
    for ($row = 3; $row -le $guideUsed.Rows.Count; $row++) {
        $code = (Get-CellText $guide $row 2).Trim()
        if (-not $code) { continue }
        $guideRows += [ordered]@{
            item_code = $code
            item_name = Get-CellText $guide $row 3
            code_rules = Get-CellText $guide $row 5
            beginning_month = Get-CellText $guide $row 6
            in_month = Get-CellText $guide $row 7
            month_end = Get-CellText $guide $row 8
            comment = Get-CellText $guide $row 9
        }
    }

    $result = [ordered]@{
        source_file = $WorkbookPath
        extracted_at = (Get-Date).ToString('s')
        sheets = [ordered]@{
            sum = [ordered]@{
                periods = $periods
                rows = $sumRows
            }
            mapping_pnl = $mappingRows
            guide = $guideRows
        }
    }

    $dir = Split-Path -Parent $OutputPath
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }

    $json = $result | ConvertTo-Json -Depth 20
    [System.IO.File]::WriteAllText($OutputPath, $json, [System.Text.Encoding]::UTF8)
}
finally {
    if ($wb) { $wb.Close($false) | Out-Null }
    $excel.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}

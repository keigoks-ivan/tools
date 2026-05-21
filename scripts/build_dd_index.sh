#!/usr/bin/env bash
# build_dd_index.sh — Extract metadata from all DD reports and output dd_index.json
# macOS compatible (uses python3 for regex, no grep -P)
# Run from repo root: bash scripts/build_dd_index.sh
# Output: docs/dd/dd_index.json

set -euo pipefail

DD_DIR="$(cd "$(dirname "$0")/../docs/dd" && pwd)"
OUT="$DD_DIR/dd_index.json"

echo "Building DD index from $DD_DIR..."

python3 - "$DD_DIR" "$OUT" <<'PYEOF'
import sys, os, re, json

dd_dir = sys.argv[1]
out_path = sys.argv[2]

# ── Region parse from filename ──
def parse_region(fname):
    f = fname.upper()
    if any(x in f for x in ['KLCC', 'STONOR3', 'CLOUTHAUS', 'ARMANIHALLSON', 'CENTRIX', 'THECONLAY']):
        return 'KLCC'
    if any(x in f for x in ['DPC', 'NOORA', 'ONECENTRALPARK', 'PARKREGENT', 'PARKPLACE', 'DESAPARKCITY']):
        return 'DPC'
    if any(x in f for x in ['MONTKIARA', 'KIARAMASDEDAUN', 'SUNWAYMONTRESIDENCES', 'PAVILIONHILLTOP',
                              'RESIDENSI22', '28MONTKIARA', 'TRINITYPENTATMONT', 'TRINITYPENTAMONT',
                              'SUNWAYMONTRESIDENCES', 'SUNWAYMONTRESIDENCES']):
        return 'Mont Kiara'
    if '28MONT' in f or 'MONTKIRARA' in f:
        return 'Mont Kiara'
    if 'BBCC' in f or 'SWNK' in f:
        return 'BBCC'
    if any(x in f for x in ['BUKITBINTANG', 'PAVILIONHD', 'PAVILIONDHAMA', 'PAVILIONDH',
                              'PAVILIONDAMANARA', 'PAVILIONSQ', 'PAVILIONSQUARE',
                              'TIMESSQUARE', 'ORIONRESIDENCE']):
        return 'Bukit Bintang'
    if 'BANGSAR' in f:
        return 'Bangsar'
    if 'TRX' in f:
        return 'TRX'
    return 'Other'

# More precise region
def parse_region_precise(fname):
    f = fname
    if re.search(r'KLCC|Stonor3|CloutHaus|Armani|Centrix|TheConlay|Conlay', f, re.I):
        return 'KLCC'
    if re.search(r'DPC|Noora|OneCentral|ParkRegent|ParkPlace|DesaParkCity', f, re.I):
        return 'DPC'
    if re.search(r'MontKiara|Mont_Kiara|KiaramasDe|SunwayMont|PavilionHilltop|Residensi22|28Mont|TrinityPentamont', f, re.I):
        return 'Mont Kiara'
    if re.search(r'BBCC|SWNK', f, re.I):
        return 'BBCC'
    if re.search(r'BukitBintang|PavilionDH|PavilionSquare|TimesSquare|OrionResidence', f, re.I):
        return 'Bukit Bintang'
    if re.search(r'Bangsar', f, re.I):
        return 'Bangsar'
    if re.search(r'TRX', f, re.I):
        return 'TRX'
    return 'Other'

def parse_date(fname):
    m = re.search(r'(\d{4})(\d{2})(\d{2})', fname)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return '—'

def parse_type(fname):
    if re.search(r'^DD_|建案完整排行榜', fname):
        return 'Summary'
    return 'Project'

def read_file(path):
    try:
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            return f.read()
    except:
        return ''

def parse_title(content, fname):
    # Try <title> first
    m = re.search(r'<title>([^<]+)</title>', content)
    if m:
        t = m.group(1)
        # Strip trailing | info
        t = re.split(r'[｜|]', t)[0].strip()
        # Strip framework version etc
        t = re.sub(r'\s*建案深度分析.*$', '', t).strip()
        t = re.sub(r'\s*深度分析.*$', '', t).strip()
        return t
    # Try h1
    m = re.search(r'<h1[^>]*>([^<]+)</h1>', content)
    if m:
        return m.group(1).strip()
    return fname.replace('.html', '')

def parse_signal(content):
    # Find verdict emoji
    signals = re.findall(r'🟢|🟡|🟠|🔴', content)
    if signals:
        return signals[0]
    return '—'

def parse_score(content):
    # Try score-big or score-number
    m = re.search(r'class="score-big[^"]*">([0-9]+\.[0-9]+)', content)
    if m:
        return m.group(1)
    m = re.search(r'class="score-number[^"]*">([0-9]+\.[0-9]+)', content)
    if m:
        return m.group(1)
    # score-number inline
    m = re.search(r'score-number">([0-9]+\.[0-9]+)', content)
    if m:
        return m.group(1)
    return '—'

def parse_yield(content):
    # Gross yield pattern
    m = re.search(r'[Gg]ross\s+[Yy]ield\s+([3-7]\.[0-9]+)%', content)
    if m:
        return m.group(1) + '%'
    m = re.search(r'([3-7]\.[0-9]+)%\s+[Gg]ross\s+[Yy]ield', content)
    if m:
        return m.group(1) + '%'
    # Try 收益率 or yield near a 3-7% number
    m = re.search(r'(?:收益率|[Yy]ield)[^0-9]{0,20}([3-7]\.[0-9]+)%', content)
    if m:
        return m.group(1) + '%'
    return '—'

def parse_psf(content):
    # Look for RM X,XXX psf pattern (Brickz section typically most authoritative)
    # Search in brickz/kv section first
    brickz_section = re.search(r'(BRICKZ|brickz|brickz-num|kv-val)(.*?)(?:P25|政府登記|yield|收益率)', content, re.S | re.I)
    if brickz_section:
        m = re.search(r'RM\s*([0-9,]+)\s*psf', brickz_section.group(0), re.I)
        if m:
            return 'RM ' + m.group(1).replace(',', ',')
    # Fallback: first RM X,XXX psf in file
    m = re.search(r'RM\s*([0-9,]+)\s*psf', content, re.I)
    if m:
        num_str = m.group(1).replace(',', '')
        try:
            num = int(num_str)
            if 100 <= num <= 10000:  # reasonable PSF range
                return 'RM ' + m.group(1)
        except:
            pass
    return '—'

def parse_total_price(content):
    # Look for 中位成交總價 RM X萬 or RM X.XM
    m = re.search(r'中位成交總價[^<]{0,30}RM\s*([0-9]+)\s*萬', content)
    if m:
        wan = int(m.group(1))
        m_val = wan / 100
        return f'RM {m_val:.1f}M'
    # brickz-num patterns like RM164萬
    m = re.search(r'brickz-num[^>]*>\s*RM([0-9]+)萬', content)
    if m:
        wan = int(m.group(1))
        return f'RM {wan/100:.1f}M'
    # kv-val RM X萬
    m = re.search(r'kv-val[^>]*>\s*RM\s*([0-9]+)萬', content)
    if m:
        wan = int(m.group(1))
        return f'RM {wan/100:.1f}M'
    # RM X.XM pattern
    m = re.search(r'RM\s*([0-9]+\.[0-9]+)\s*M(?:\b|<)', content)
    if m:
        return f'RM {m.group(1)}M'
    return '—'

def price_bucket(total_str, psf_str):
    """Determine price bucket from total price string."""
    if total_str and total_str != '—':
        m = re.search(r'([0-9]+\.[0-9]+|[0-9]+)', total_str)
        if m:
            val = float(m.group(1))
            if val >= 5: return '5M+'
            if val >= 2: return '2-5M'
            if val >= 1: return '1-2M'
            return '<1M'
    return '—'

# ── Process all HTML files ──
files = sorted(f for f in os.listdir(dd_dir) if f.endswith('.html') and f != 'index.html')

records = []
for fname in files:
    path = os.path.join(dd_dir, fname)
    content = read_file(path)

    rec_type = parse_type(fname)
    region = parse_region_precise(fname)
    date = parse_date(fname)
    title = parse_title(content, fname)
    signal = parse_signal(content)
    score = parse_score(content)
    yld = parse_yield(content)
    psf = parse_psf(content)
    total = parse_total_price(content)
    bucket = price_bucket(total, psf)

    records.append({
        'file': fname,
        'title': title,
        'type': rec_type,
        'region': region,
        'date': date,
        'psf': psf,
        'totalPrice': total,
        'priceBucket': bucket,
        'yield': yld,
        'signal': signal,
        'score': score
    })

    print(f"  {fname}: region={region} signal={signal} score={score} yield={yld} psf={psf}")

# Sort: Summary first, then by date desc
records.sort(key=lambda r: (0 if r['type']=='Summary' else 1, r['date']), reverse=False)
records.sort(key=lambda r: r['type']=='Summary', reverse=True)

with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(records, f, ensure_ascii=False, indent=2)

print(f"\nDone! Output: {out_path}")
print(f"Total records: {len(records)}")
PYEOF

echo ""
echo "Script complete."

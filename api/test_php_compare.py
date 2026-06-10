import re
import requests
from bs4 import BeautifulSoup

session = requests.Session()

session.post(
    "https://portal.enertsol.com/login.php",
    data={"login": "amit.kumar.jha20@gmail.com", "pass": "123456", "submit": "Submit"},
    timeout=30,
)

response = session.get(
    "https://portal.enertsol.com/billing_extract_result.php", timeout=60
)

soup = BeautifulSoup(response.text, "html.parser")

# Find all tables and their first Check # header
checks = {}
all_tables = soup.find_all("table")
for table in all_tables:
    check_td = table.find("td", string=re.compile(r"^Check\s*#\s*\d+\s*$"))
    if check_td:
        check_num = re.search(r"\d+", check_td.get_text()).group()
        rows = table.find_all("tr")
        max_sr = 0
        for r in rows:
            if r.get("bgcolor"):
                continue
            if r.find("textarea") or r.find("input"):
                continue
            all_tds = r.find_all("td")
            if len(all_tds) >= 2:
                if (
                    all_tds[0].get_text(strip=True).isdigit()
                    and all_tds[1].get_text(strip=True) != ""
                ):
                    sr_val = int(all_tds[0].get_text(strip=True))
                    if sr_val > max_sr:
                        max_sr = sr_val
        checks[check_num] = max_sr  # last occurrence wins

print("PHP check counts:")
for k in sorted(checks.keys(), key=lambda x: int(x)):
    print(f"  check_{k}: {checks[k]}")

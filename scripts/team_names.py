"""
球隊中文名稱對照表（只顯示隊名，不含城市）
"""

NBA_ZH: dict[str, str] = {
    "ATL": "老鷹",
    "BOS": "塞爾提克",
    "BKN": "籃網",
    "CHA": "黃蜂",
    "CHI": "公牛",
    "CLE": "騎士",
    "DAL": "獨行俠",
    "DEN": "金塊",
    "DET": "活塞",
    "GSW": "勇士",
    "HOU": "火箭",
    "IND": "步行者",
    "LAC": "快艇",
    "LAL": "湖人",
    "MEM": "灰熊",
    "MIA": "熱火",
    "MIL": "公鹿",
    "MIN": "灰狼",
    "NOP": "鵜鶘",
    "NYK": "尼克",
    "OKC": "雷霆",
    "ORL": "魔術",
    "PHI": "76人",
    "PHX": "太陽",
    "POR": "拓荒者",
    "SAC": "國王",
    "SAS": "馬刺",
    "TOR": "暴龍",
    "UTA": "爵士",
    "WAS": "巫師",
}

MLB_ZH: dict[str, str] = {
    "ARI": "響尾蛇",
    "ATL": "勇士",
    "BAL": "金鶯",
    "BOS": "紅襪",
    "CHC": "小熊",
    "CWS": "白襪",
    "CIN": "紅人",
    "CLE": "守護者",
    "COL": "落磯",
    "DET": "老虎",
    "HOU": "太空人",
    "KC":  "皇家",
    "LAA": "天使",
    "LAD": "道奇",
    "MIA": "馬林魚",
    "MIL": "釀酒人",
    "MIN": "雙城",
    "NYM": "大都會",
    "NYY": "洋基",
    "OAK": "運動家",
    "PHI": "費城人",
    "PIT": "海盜",
    "SD":  "教士",
    "SEA": "水手",
    "SF":  "巨人",
    "STL": "紅雀",
    "TB":  "光芒",
    "TEX": "遊騎兵",
    "TOR": "藍鳥",
    "WSH": "國民",
}


def nba_zh(abbr: str) -> str:
    return NBA_ZH.get(abbr, abbr)


def mlb_zh(abbr: str) -> str:
    return MLB_ZH.get(abbr, abbr)

// Complete Chinese translations for all 30 MLB + 30 NBA teams
// Used to render team names in the zh-TW UI

const MLB_TEAMS: Record<string, string> = {
  AZ:  '亞利桑那響尾蛇', ATL: '亞特蘭大勇士', BAL: '巴爾的摩金鶯',
  BOS: '波士頓紅襪',     CHC: '芝加哥小熊',   CWS: '芝加哥白襪',
  CIN: '辛辛那提紅人',   CLE: '克里夫蘭守護者',  COL: '科羅拉多洛磯',
  DET: '底特律老虎',     HOU: '休士頓太空人',   KC:  '堪薩斯皇家',
  LAA: '洛杉磯天使',     LAD: '洛杉磯道奇',     MIA: '邁阿密馬林魚',
  MIL: '密爾瓦基釀酒人', MIN: '明尼蘇達雙城',   NYM: '紐約大都會',
  NYY: '紐約洋基',       OAK: '奧克蘭運動家',   PHI: '費城費城人',
  PIT: '匹茲堡海盜',     SD:  '聖地牙哥教士',   SF:  '舊金山巨人',
  SEA: '西雅圖水手',     STL: '聖路易紅雀',     TB:  '坦帕灣光芒',
  TEX: '德州遊騎兵',     TOR: '多倫多藍鳥',     WSH: '華盛頓國民',
};

const NBA_TEAMS: Record<string, string> = {
  ATL: '亞特蘭大老鷹',     BOS: '波士頓塞爾提克', BKN: '布魯克林籃網',
  CHA: '夏洛特黃蜂',       CHI: '芝加哥公牛',     CLE: '克里夫蘭騎士',
  DAL: '達拉斯獨行俠',     DEN: '丹佛金塊',       DET: '底特律活塞',
  GS:  '金州勇士',         GSW: '金州勇士',       HOU: '休士頓火箭',
  IND: '印第安納溜馬',     LAC: '洛杉磯快艇',     LAL: '洛杉磯湖人',
  MEM: '曼菲斯灰熊',       MIA: '邁阿密熱火',     MIL: '密爾瓦基公鹿',
  MIN: '明尼蘇達灰狼',     NOP: '紐奧良鵜鶘',     NO:  '紐奧良鵜鶘',
  NY:  '紐約尼克',         NYK: '紐約尼克',       OKC: '奧克拉荷馬雷霆',
  ORL: '奧蘭多魔術',       PHI: '費城76人',       PHX: '鳳凰城太陽',
  POR: '波特蘭拓荒者',     SAC: '沙加緬度國王',   SA:  '聖安東尼奧馬刺',
  SAS: '聖安東尼奧馬刺',   TOR: '多倫多暴龍',     UTAH:'猶他爵士',
  UTA: '猶他爵士',         WAS: '華盛頓巫師',     WSH: '華盛頓巫師',
};

export function getTeamNameCn(code: string, league: 'MLB' | 'NBA'): string {
  const upper = code.toUpperCase();
  if (league === 'MLB') return MLB_TEAMS[upper] || code;
  return NBA_TEAMS[upper] || code;
}

export function getTeamNameCnAny(code: string): string {
  const upper = code.toUpperCase();
  return NBA_TEAMS[upper] || MLB_TEAMS[upper] || code;
}

export function findTeamCodeByName(name: string, league: 'MLB' | 'NBA'): string | null {
  const cleanName = name.trim();
  if (!cleanName) return null;

  const upperCode = cleanName.toUpperCase();
  const dict = league === 'MLB' ? MLB_TEAMS : NBA_TEAMS;
  if (dict[upperCode]) return upperCode;

  // Standard abbreviations mapping helper
  if (league === 'MLB') {
    if (upperCode === 'NYY') return 'NYY';
    if (upperCode === 'LAD') return 'LAD';
    if (upperCode === 'SFG') return 'SF';
    if (upperCode === 'WSH') return 'WSH';
    if (upperCode === 'WAS') return 'WSH';
    if (upperCode === 'CWS') return 'CWS';
    if (upperCode === 'CHC') return 'CHC';
    if (upperCode === 'LAA') return 'LAA';
    if (upperCode === 'MIL') return 'MIL';
    if (upperCode === 'SDG') return 'SD';
  } else {
    if (upperCode === 'GSW') return 'GSW';
    if (upperCode === 'GS') return 'GSW';
    if (upperCode === 'LAL') return 'LAL';
    if (upperCode === 'LAC') return 'LAC';
    if (upperCode === 'BKN') return 'BKN';
    if (upperCode === 'BRK') return 'BKN';
    if (upperCode === 'PHX') return 'PHX';
    if (upperCode === 'PHO') return 'PHX';
    if (upperCode === 'SAS') return 'SAS';
    if (upperCode === 'SA') return 'SAS';
    if (upperCode === 'NYK') return 'NYK';
    if (upperCode === 'NY') return 'NYK';
    if (upperCode === 'NOP') return 'NOP';
    if (upperCode === 'NOH') return 'NOP';
  }

  // Exact or partial name match
  for (const [code, cnName] of Object.entries(dict)) {
    if (cnName === cleanName || cnName.includes(cleanName) || cleanName.includes(cnName)) {
      return code;
    }
  }

  // Common aliases
  const commonAlias: Record<string, Record<string, string>> = {
    MLB: {
      '洋基': 'NYY',
      '道奇': 'LAD',
      '紅襪': 'BOS',
      '小熊': 'CHC',
      '白襪': 'CWS',
      '巨人': 'SF',
      '天使': 'LAA',
      '大都會': 'NYM',
      '釀酒人': 'MIL',
      '教士': 'SD',
      '太空人': 'HOU',
      '勇士': 'ATL',
      '金鶯': 'BAL',
      '老虎': 'DET',
      '水手': 'SEA',
      '遊騎兵': 'TEX',
      '響尾蛇': 'AZ',
      '雙城': 'MIN',
      '紅人': 'CIN',
      '守護者': 'CLE',
      '洛磯': 'COL',
      '皇家': 'KC',
      '馬林魚': 'MIA',
      '運動家': 'OAK',
      '海盜': 'PIT',
      '紅雀': 'STL',
      '光芒': 'TB',
      '藍鳥': 'TOR',
      '國民': 'WSH'
    },
    NBA: {
      '湖人': 'LAL',
      '快艇': 'LAC',
      '勇士': 'GSW',
      '塞爾提克': 'BOS',
      '塞爾特人': 'BOS',
      '籃網': 'BKN',
      '公牛': 'CHI',
      '尼克': 'NYK',
      '熱火': 'MIA',
      '太陽': 'PHX',
      '76人': 'PHI',
      '獨行俠': 'DAL',
      '小牛': 'DAL',
      '金塊': 'DEN',
      '火箭': 'HOU',
      '溜馬': 'IND',
      '灰熊': 'MEM',
      '公鹿': 'MIL',
      '灰狼': 'MIN',
      '鵜鶘': 'NOP',
      '雷霆': 'OKC',
      '魔術': 'ORL',
      '拓荒者': 'POR',
      '國王': 'SAC',
      '馬刺': 'SAS',
      '暴龍': 'TOR',
      '爵士': 'UTA',
      '巫師': 'WAS',
      '老鷹': 'ATL',
      '黃蜂': 'CHA',
      '活塞': 'DET'
    }
  };

  const aliasDict = commonAlias[league];
  if (aliasDict) {
    for (const [alias, code] of Object.entries(aliasDict)) {
      if (cleanName.includes(alias) || alias.includes(cleanName)) {
        return code;
      }
    }
  }

  return null;
}

/**
 * 將投注選項翻譯成中文
 */
export function translateSelection(selection: string, league?: 'MLB' | 'NBA'): string {
  const clean = selection.trim().toLowerCase();
  if (clean === 'home') return '主勝';
  if (clean === 'away') return '客勝';
  if (clean === 'over') return '大';
  if (clean === 'under') return '小';
  if (clean === '一樣多' || clean === '和' || clean === '和局') return '一樣多';
  
  // 試著翻譯隊伍代碼
  const upper = selection.toUpperCase();
  if (league) {
    const cnName = getTeamNameCn(upper, league);
    if (cnName !== upper) return cnName;
  }
  const cnNameAny = getTeamNameCnAny(upper);
  if (cnNameAny !== upper) return cnNameAny;

  return selection;
}

/**
 * 將玩法類型翻譯成中文
 */
export function translateMarketType(market: string): string {
  const clean = market.trim().toLowerCase();
  if (clean === 'moneyline' || clean === '不讓分') return '獨贏';
  if (clean === 'spread') return '讓分';
  if (clean === 'totals') return '大小';
  if (clean === 'period_highest') return '最高得分單局/節';
  return market;
}

const PLAYER_FIRST_NAMES: Record<string, string> = {
  'LUIS': '路易斯', 'CADE': '凱德', 'RANDY': '蘭迪', 'TREY': '特雷',
  'CONNOR': '康納', 'MATTHEW': '馬修', 'KEVIN': '凱文', 'CAM': '卡姆',
  'AUSTIN': '奧斯汀', 'LOGAN': '羅根', 'GEORGE': '喬治', 'BOBBY': '鮑比',
  'COLE': '柯爾', 'RILEY': '萊利', 'SPENCER': '史賓瑟', 'JOSE': '荷西',
  'EMMANUEL': '艾曼紐', 'SHANE': '謝恩', 'PABLO': '巴勃羅', 'ROYCE': '羅伊斯',
  'JHOAN': '喬安', 'BO': '波', 'VLADIMIR': '弗拉迪米爾', 'CHRIS': '克里斯',
  'ADLEY': '艾德利', 'GUNNAR': '剛納', 'KYLE': '凱爾', 'CEDRIC': '塞德里克',
  'RAFAEL': '拉斐爾', 'TRISTON': '崔斯頓', 'BRAYAN': '布萊恩', 'YANDY': '揚迪',
  'ZACH': '扎克', 'ISAAC': '艾薩克', 'CORBIN': '科賓', 'DYLAN': '狄倫',
  'ALEX': '亞歷克斯', 'YORDAN': '約旦', 'FRAMBER': '弗蘭伯', 'JULIO': '胡里歐',
  'SALVADOR': '薩爾瓦多', 'TARIK': '塔里克', 'PAUL': '保羅', 'NOLAN': '諾蘭',
  'JORDAN': '喬丹', 'PETE': '彼得', 'FRANCISCO': '法蘭西斯科', 'BRYCE': '布萊斯',
  'TREA': '特里亞', 'ZACK': '扎克', 'AARON': '亞倫', 'JUAN': '胡安',
  'GERRIT': '蓋瑞特', 'JUSTIN': '賈斯汀', 'MAX': '麥克斯', 'CLAYTON': '克萊頓',
  'COREY': '柯瑞', 'MARCUS': '馬庫斯', 'ADOLIS': '阿多利斯', 'ZAC': '扎克',
  'MATT': '馬特', 'RONALD': '羅納德', 'MOOKIE': '姆奇', 'FREDDIE': '弗雷迪',
  'STEPHEN': '史蒂芬', 'LEBRON': '勒布朗', 'GIANNIS': '揚尼斯', 'LUKA': '盧卡',
  'NIKOLA': '尼古拉', 'JOEL': '喬爾', 'JAYSON': '傑森', 'DAMIAN': '達米安',
  'KYRIE': '凱里', 'KAWHI': '科懷', 'DEVIN': '德文', 'JAMES': '詹姆斯',
  'RUSSELL': '羅素', 'ANTHONY': '安東尼', 'SHAI': '謝伊', 'DONOVAN': '多諾萬',
  'JAYLEN': '傑倫', 'JA': '賈', 'ZION': '錫安', "DE'AARON": '德阿隆',
  'DOMANTAS': '多曼塔斯', 'TRAE': '特雷', 'BAM': '班', 'JALEN': '傑倫',
  'TYRESE': '泰瑞澤', 'LAMELO': '拉梅洛', 'RUDY': '魯迪', 'VICTOR': '維克托',
  'PAOLO': '保羅', 'KRISTAPS': '克里斯塔普斯', 'KLAY': '克萊', 'DRAYMOND': '德雷蒙德',
  'YUTA': '雄太', 'RUI': '壘'
};

const PLAYER_LAST_NAMES: Record<string, string> = {
  'CASTILLO': '卡斯提歐', 'CAVALLI': '卡瓦利', 'VASQUEZ': '瓦茲奎茲',
  'GIBSON': '吉布森', 'PRIELIPP': '普里利普', 'LIBERATORE': '利貝拉托爾',
  'GAUSMAN': '高斯曼', 'SCHLITTLER': '施利特勒', 'OHTANI': '大谷',
  'YAMAMOTO': '山本', 'IMANAGA': '今永', 'SENGA': '千賀', 'DARVISH': '達比修',
  'MAEDA': '前田', 'SUZUKI': '鈴木', 'YOSHIDA': '吉田', 'KIM': '金',
  'ACUNA': '阿庫尼亞', 'BETTS': '貝茲', 'FREEMAN': '弗里曼', 'JUDGE': '賈吉',
  'SOTO': '索托', 'COLE': '柯爾', 'VERLANDER': '韋蘭德', 'SCHERZER': '薛澤',
  'KERSHAW': '柯蕭', 'SEAGER': '席格', 'SEMIEN': '塞米恩', 'GARCIA': '賈西亞',
  'GALLEN': '加倫', 'CARROLL': '卡洛爾', 'STRIDER': '史崔德', 'OLSON': '奧爾森',
  'RILEY': '萊利', 'HARPER': '哈波', 'TURNER': '特納', 'WHEELER': '惠勒',
  'SCHWARBER': '舒瓦伯', 'REALMUTO': '瑞爾穆托', 'LINDOR': '林多',
  'ALONSO': '阿隆索', 'BURNES': '伯恩斯', 'WILLIAMS': '威廉斯', 'YELICH': '葉力奇',
  'GOLDSCHMIDT': '高施密特', 'ARENADO': '阿里納多', 'MONTGOMERY': '蒙哥馬利',
  'ROBERT': '羅伯特', 'CEASE': '希斯', 'ALTUVE': '奧圖維', 'BREGMAN': '布萊格曼',
  'ALVAREZ': '艾爾法瑞茲', 'VALDEZ': '瓦德茲', 'TUCKER': '塔克',
  'RODRIGUEZ': '羅德里奎茲', 'KIRBY': '科比', 'GILBERT': '吉爾伯特',
  'WITT': '威特', 'RAGANS': '雷根斯', 'PEREZ': '培瑞茲', 'SKUBAL': '斯庫伯',
  'GREENE': '格林', 'TORKELSON': '托克爾森', 'RAMIREZ': '拉米瑞茲',
  'CLASE': '克拉瑟', 'BIEBER': '比伯', 'LOPEZ': '羅培茲', 'LEWIS': '路易斯',
  'DURAN': '杜蘭', 'BICHETTE': '比薛特', 'GUERRERO': '葛雷諾', 'BASSITT': '貝西特',
  'BERRIOS': '貝瑞歐斯', 'RUTSCHMAN': '拉區曼', 'HENDERSON': '韓德森',
  'BRADISH': '布拉迪許', 'MULLINS': '馬林斯', 'DEVERS': '迪佛斯',
  'CASAS': '卡薩斯', 'BELLO': '貝歐', 'AROZARENA': '阿羅薩雷納', 'DIAZ': '迪亞茲',
  'EFLIN': '艾夫林', 'PAREDES': '帕雷迪斯', 'JAMES': '詹姆斯', 'CURRY': '柯瑞',
  'DURANT': '杜蘭特', 'DAVIS': '戴維斯', 'DONCIC': '東契奇', 'JOKIC': '約基奇',
  'EMBIID': '恩比德', 'TATUM': '塔圖姆', 'ANTETOKOUNMPO': '安戴托昆波',
  'LILLARD': '里拉德', 'IRVING': '歐文', 'LEONARD': '萊納德', 'GEORGE': '喬治',
  'BUTLER': '巴特勒', 'BOOKER': '布克', 'PAUL': '保羅', 'HARDEN': '哈登',
  'WESTBROOK': '威斯布魯克', 'GILGEOUS': '吉爾傑斯', 'ALEXANDER': '亞歷山大',
  'MITCHELL': '米契爾', 'BROWN': '布朗', 'MORANT': '莫蘭特', 'WILLIAMSON': '威廉森',
  'FOX': '福克斯', 'SABONIS': '薩博尼斯', 'YOUNG': '楊', 'ADEBAYO': '阿德巴約',
  'BRUNSON': '布倫森', 'HALIBURTON': '哈利伯頓', 'BALL': '鮑爾', 'EDWARDS': '愛德華茲',
  'TOWNS': '唐斯', 'GOBERT': '戈貝爾', 'WEMBANYAMA': '溫班亞馬', 'BANCHERO': '班切羅',
  'PORZINGIS': '波爾辛吉斯', 'THOMPSON': '湯普森', 'GREEN': '格林', 'REAVES': '里夫斯',
  'HACHIMURA': '八村壘', 'WATANABE': '渡邊雄太'
};

const EXACT_PLAYERS: Record<string, string> = {
  'SHOHEI OHTANI': '大谷翔平',
  'YOSHINOBU YAMAMOTO': '山本由伸',
  'SHOTA IMANAGA': '今永昇太',
  'KODAI SENGA': '千賀滉大',
  'YU DARVISH': '達比修有',
  'KENTA MAEDA': '前田健太',
  'SEIYA SUZUKI': '鈴木誠也',
  'MASATAKA YOSHIDA': '吉田正尚',
  'HA-SEONG KIM': '金河成',
  'RUI HACHIMURA': '八村壘',
  'YUTA WATANABE': '渡邊雄太',
  'LEBRON JAMES': '勒布朗·詹姆斯'
};

export function translatePlayerName(name: string): string {
  if (!name) return name;
  const trimmed = name.trim();
  const upper = trimmed.toUpperCase();
  if (EXACT_PLAYERS[upper]) return EXACT_PLAYERS[upper];

  // Normalize accents
  const cleanName = trimmed.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const cleanUpper = cleanName.toUpperCase();
  if (EXACT_PLAYERS[cleanUpper]) return EXACT_PLAYERS[cleanUpper];

  // Split by space, dot, hyphen
  const parts = trimmed.split(/([\s\.-]+)/);
  const translatedParts = parts.map(part => {
    if (/[\s\.-]/.test(part)) {
      return part === ' ' ? '·' : part;
    }
    const normPart = part.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const partUpper = normPart.toUpperCase();
    if (PLAYER_FIRST_NAMES[partUpper]) return PLAYER_FIRST_NAMES[partUpper];
    if (PLAYER_LAST_NAMES[partUpper]) return PLAYER_LAST_NAMES[partUpper];
    return part;
  });

  return translatedParts.join('');
}

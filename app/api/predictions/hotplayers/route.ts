import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getCacheFilePath(league: string): string {
  const path = eval('require')('path');
  const isVercel = process.env.VERCEL === '1' || process.env.NOW_BUILDER === '1';
  if (isVercel) {
    return path.join('/tmp', 'betting-store', `hotplayers_${league.toLowerCase()}_cache.json`);
  }
  return path.join(process.cwd(), 'prisma', 'betting-store', `hotplayers_${league.toLowerCase()}_cache.json`);
}

function getCurrentNBASeason(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  if (month >= 10) { // Season starts in October
    const nextYearAbbr = String(year + 1).slice(-2);
    return `${year}-${nextYearAbbr}`;
  } else {
    const prevYear = year - 1;
    const currentYearAbbr = String(year).slice(-2);
    return `${prevYear}-${currentYearAbbr}`;
  }
}

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const league = searchParams.get('league')?.toUpperCase();

  if (!league || (league !== 'NBA' && league !== 'MLB')) {
    return NextResponse.json(
      { success: false, error: 'League parameter is required (NBA or MLB)' },
      { status: 400 }
    );
  }

  const cacheFile = getCacheFilePath(league);
  const fs = eval('require')('fs');
  const path = eval('require')('path');

  // Check Cache (4 hours TTL = 14,400,000 ms - stats don't change as frequently as injuries)
  try {
    if (fs.existsSync(cacheFile)) {
      const stats = fs.statSync(cacheFile);
      const ageMs = Date.now() - stats.mtimeMs;
      if (ageMs < 14400000) {
        const cachedData = fs.readFileSync(cacheFile, 'utf8');
        return NextResponse.json({
          success: true,
          league,
          cached: true,
          timestamp: stats.mtime.toISOString(),
          data: JSON.parse(cachedData)
        }, {
          headers: {
            'Cache-Control': 'public, max-age=600'
          }
        });
      }
    }
  } catch (err) {
    console.warn('[HotPlayers API] Cache read warning:', err);
  }

  // Fetch and Parse
  try {
    const hotMap: Record<string, { name: string; reason: string }> = {};

    if (league === 'NBA') {
      const season = getCurrentNBASeason();
      const url = `https://stats.nba.com/stats/leagueleaders?LeagueID=00&PerMode=PerGame&Scope=S&Season=${season}&SeasonType=Regular+Season&StatCategory=PTS`;
      
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Origin': 'https://www.nba.com',
          'Referer': 'https://www.nba.com/'
        },
        next: { revalidate: 7200 }
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch NBA league leaders: status ${res.status}`);
      }

      const json = await res.json();
      if (json.resultSet && json.resultSet.headers && json.resultSet.rowSet) {
        const headers = json.resultSet.headers;
        const playerIdx = headers.indexOf('PLAYER');
        const ptsIdx = headers.indexOf('PTS');
        const astIdx = headers.indexOf('AST');
        const rebIdx = headers.indexOf('REB');
        const blkIdx = headers.indexOf('BLK');
        const stlIdx = headers.indexOf('STL');
        const gpIdx = headers.indexOf('GP');

        for (const row of json.resultSet.rowSet) {
          const name = row[playerIdx];
          const gp = row[gpIdx];
          const pts = row[ptsIdx];
          const ast = row[astIdx];
          const reb = row[rebIdx];
          const blk = row[blkIdx];
          const stl = row[stlIdx];

          // Thresholds for superstar performance
          if (gp < 8) continue;

          const reasons: string[] = [];
          if (pts >= 22.0) reasons.push(`${pts} PTS`);
          if (ast >= 8.0) reasons.push(`${ast} AST`);
          if (reb >= 10.0) reasons.push(`${reb} REB`);
          if (blk >= 2.0) reasons.push(`${blk} BLK`);
          if (stl >= 1.8) reasons.push(`${stl} STL`);

          if (reasons.length > 0) {
            const key = normalizeText(name);
            hotMap[key] = {
              name,
              reason: reasons.join(', ')
            };
          }
        }
      }
    } else { // MLB
      const season = new Date().getFullYear();
      const hitUrl = `https://statsapi.mlb.com/api/v1/stats?stats=season&group=hitting&season=${season}&limit=120&sortStat=ops`;
      const pitchUrl = `https://statsapi.mlb.com/api/v1/stats?stats=season&group=pitching&season=${season}&limit=80&sortStat=era`;

      const [hitRes, pitchRes] = await Promise.all([
        fetch(hitUrl, { next: { revalidate: 7200 } }),
        fetch(pitchUrl, { next: { revalidate: 7200 } })
      ]);

      if (hitRes.ok) {
        const hitJson = await hitRes.json();
        if (hitJson.stats?.[0]?.splits) {
          for (const split of hitJson.stats[0].splits) {
            const name = split.player.fullName;
            const ops = parseFloat(split.stat.ops);
            const avg = parseFloat(split.stat.avg);
            const gp = split.stat.gamesPlayed;

            if (gp < 15) continue;

            const reasons: string[] = [];
            if (ops >= 0.820) reasons.push(`OPS ${split.stat.ops}`);
            if (avg >= 0.280) reasons.push(`AVG ${split.stat.avg}`);

            if (reasons.length > 0) {
              const key = normalizeText(name);
              hotMap[key] = {
                name,
                reason: reasons.join(', ')
              };
            }
          }
        }
      }

      if (pitchRes.ok) {
        const pitchJson = await pitchRes.json();
        if (pitchJson.stats?.[0]?.splits) {
          for (const split of pitchJson.stats[0].splits) {
            const name = split.player.fullName;
            const era = parseFloat(split.stat.era);
            const gp = split.stat.gamesPlayed;
            const whip = parseFloat(split.stat.whip);

            if (gp < 5) continue;

            const reasons: string[] = [];
            if (era <= 3.30) reasons.push(`ERA ${split.stat.era}`);
            if (whip && whip <= 1.15) reasons.push(`WHIP ${split.stat.whip}`);

            if (reasons.length > 0) {
              const key = normalizeText(name);
              hotMap[key] = {
                name,
                reason: reasons.join(', ')
              };
            }
          }
        }
      }
    }

    // Write Cache
    try {
      const dir = path.dirname(cacheFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(cacheFile, JSON.stringify(hotMap, null, 2), 'utf8');
      console.log(`[HotPlayers API] Wrote cache file: ${cacheFile}`);
    } catch (err) {
      console.warn('[HotPlayers API] Cache write failed:', err);
    }

    return NextResponse.json({
      success: true,
      league,
      cached: false,
      timestamp: new Date().toISOString(),
      data: hotMap
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      }
    });

  } catch (error) {
    console.error('[HotPlayers API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

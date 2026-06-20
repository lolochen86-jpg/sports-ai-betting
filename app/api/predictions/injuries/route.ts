import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getCacheFilePath(league: string): string {
  const path = eval('require')('path');
  const isVercel = process.env.VERCEL === '1' || process.env.NOW_BUILDER === '1';
  if (isVercel) {
    return path.join('/tmp', 'betting-store', `injuries_${league.toLowerCase()}_cache.json`);
  }
  return path.join(process.cwd(), 'prisma', 'betting-store', `injuries_${league.toLowerCase()}_cache.json`);
}

function stripTags(htmlStr: string): string {
  return htmlStr.replace(/<\/?[^>]+(>|$)/g, "").trim();
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

  // Check Cache (2 hours TTL = 7,200,000 ms)
  try {
    if (fs.existsSync(cacheFile)) {
      const stats = fs.statSync(cacheFile);
      const ageMs = Date.now() - stats.mtimeMs;
      if (ageMs < 7200000) {
        const cachedData = fs.readFileSync(cacheFile, 'utf8');
        return NextResponse.json({
          success: true,
          league,
          cached: true,
          timestamp: stats.mtime.toISOString(),
          data: JSON.parse(cachedData)
        }, {
          headers: {
            'Cache-Control': 'public, max-age=300'
          }
        });
      }
    }
  } catch (err) {
    console.warn('[Injuries API] Cache read warning:', err);
  }

  // Fetch and Parse
  try {
    const url = `https://www.espn.com/${league.toLowerCase()}/injuries`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      next: { revalidate: 3600 } // CDN caching fallback
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch ESPN injuries page: status ${res.status}`);
    }

    const html = await res.text();
    
    // Parse using RegExp
    const teamsList: any[] = [];
    const teamBlocks = html.split(/class="[^"]*Table__league-injuries[^"]*"/g);
    
    // The first block is header junk
    for (let i = 1; i < teamBlocks.length; i++) {
      const block = teamBlocks[i];
      const teamNameMatch = block.match(/class="injuries__teamName[^"]*"[^>]*>([^<]+)/i) || 
                            block.match(/<span[^>]*class="[^"]*teamName[^"]*"[^>]*>([^<]+)/i);
      
      if (!teamNameMatch) continue;
      const teamName = teamNameMatch[1].trim();
      
      const trs = block.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) ?? [];
      const players: any[] = [];

      for (const tr of trs) {
        if (tr.includes('<th')) continue; // skip header row
        
        const nameCell = tr.match(/class="[^"]*col-name[^"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? '';
        const posCell = tr.match(/class="[^"]*col-pos[^"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? '';
        const statCell = tr.match(/class="[^"]*col-stat[^"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? '';
        const commentCell = tr.match(/class="[^"]*col-desc[^"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? '';

        if (!nameCell) continue;

        players.push({
          name: stripTags(nameCell),
          position: stripTags(posCell),
          status: stripTags(statCell),
          comment: stripTags(commentCell)
        });
      }

      teamsList.push({
        team: teamName,
        players
      });
    }

    // Write Cache
    try {
      const dir = path.dirname(cacheFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(cacheFile, JSON.stringify(teamsList, null, 2), 'utf8');
      console.log(`[Injuries API] Wrote cache file: ${cacheFile}`);
    } catch (err) {
      console.warn('[Injuries API] Cache write failed:', err);
    }

    return NextResponse.json({
      success: true,
      league,
      cached: false,
      timestamp: new Date().toISOString(),
      data: teamsList
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      }
    });

  } catch (error) {
    console.error('[Injuries API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

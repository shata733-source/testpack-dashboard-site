import { json, requirePagePermission } from '../../_shared/auth.js';

// V55: Facets are shared data. Short server-side cache prevents repeated DISTINCT scans.
const FACETS_CACHE = globalThis.__BITEM_FACETS_CACHE__ || (globalThis.__BITEM_FACETS_CACHE__ = { ts: 0, data: null });
const FACETS_TTL_MS = 10 * 60 * 1000;

export async function onRequestGet(context) {
  try {
    if (!context.env || !context.env.DB) return json({ ok:false, error:'D1 binding DB is not configured' }, 500);
    const auth = await requirePagePermission(context, 'bitem', 'view');
    if (auth.error) return auth.error;

    if (FACETS_CACHE.data && Date.now() - FACETS_CACHE.ts < FACETS_TTL_MS) {
      return json({ ok: true, facets: FACETS_CACHE.data, cached: true });
    }

    const [areas, stages] = await Promise.all([
      context.env.DB.prepare(`SELECT DISTINCT area AS v FROM bitem_registry WHERE active=1 AND area IS NOT NULL AND area<>'' ORDER BY area LIMIT 500`).all(),
      context.env.DB.prepare(`SELECT DISTINCT construction_stage AS v FROM bitem_registry WHERE active=1 AND construction_stage IS NOT NULL AND construction_stage<>'' ORDER BY construction_stage LIMIT 250`).all()
    ]);

    const facets = {
      areas: (areas.results || []).map(x => x.v).filter(Boolean),
      stages: (stages.results || []).map(x => x.v).filter(Boolean),
      contractors: ['CCC', 'JGC Direct MP']
    };
    FACETS_CACHE.ts = Date.now();
    FACETS_CACHE.data = facets;
    return json({ ok: true, facets, cached: false });
  } catch (e) {
    return json({ ok:false, error:(e && e.message) ? e.message : String(e || 'Unknown error') }, 500);
  }
}

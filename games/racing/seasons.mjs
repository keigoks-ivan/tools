// Representative playable seasonal conditions, not live weather or climate averages.
// Tropical wet/dry presets simplify monsoon timing; "dry" means relatively less rain.
export const SEASON_REFERENCE_SOURCES = Object.freeze([
  'https://www.met.gov.my/data/research/researchpapers/2020/RP01_2020.pdf',
  'https://www.tmd.go.th/en/ClimateChart',
  'https://climate.cwa.gov.tw/SeasonalClimate?subpage=Winter',
  'https://www.bom.gov.au/news-and-media/solstices-equinoxes-and-the-seasons',
  'https://www.weather.gov/okx/LocalClimatologicalData',
  'https://www.climate.weather.gc.ca/climate_normals/index_e.html',
  'https://www.data.jma.go.jp/stats/etrn/view/nml_sfc_ym.php?block_no=47770&prec_no=63&view=p1',
  'https://www.metoffice.gov.uk/binaries/content/assets/metofficegovuk/pdf/research/climate-science/climate-observations-projections-and-impacts/uk.pdf',
  'https://www.ipma.pt/opencms/bin/file.data/climate-normal/cn_91-20_LISBOA_GEOFISICO.pdf',
  'https://meteofrance.com/changement-climatique/le-climat-en-france-hexagonale-et-corse',
  'https://www.weather.gov/mtr/sfd_climate',
  'https://hydro.chmi.cz/hpps/snh/objekt/2800647',
]);

const climate = Object.freeze({
  costa: 'mediterranean', alpine: 'alpine', canyon: 'desert', grandprix: 'temperate',
  taipei: 'subtropical', kualalumpur: 'tropical', kobe: 'japanese-port', london: 'maritime',
  sydney: 'southern-coast', goldcoast: 'southern-subtropical', melbourne: 'southern-temperate',
  paris: 'maritime', prague: 'continental', newcastle: 'maritime', bangkok: 'tropical',
  sanfrancisco: 'california-coast', newyork: 'continental', vancouver: 'pacific-coast',
  hanoi: 'subtropical', lisbon: 'mediterranean', marseille: 'mediterranean', nice: 'mediterranean', warwick: 'maritime',
});
const temperatures = {
  costa: [18, 28, 20, 11], alpine: [10, 19, 8, -5], canyon: [24, 36, 22, 12], grandprix: [17, 27, 15, 7],
  taipei: [22, 31, 25, 15], kobe: [16, 29, 20, 7], london: [13, 22, 13, 6],
  sydney: [21, 27, 20, 14], goldcoast: [24, 29, 24, 19], melbourne: [18, 25, 17, 10],
  paris: [15, 25, 14, 5], prague: [12, 24, 11, -1], newcastle: [11, 19, 11, 5],
  sanfrancisco: [16, 20, 20, 12], newyork: [16, 28, 16, -2], vancouver: [12, 22, 12, 0],
  hanoi: [22, 32, 25, 17], lisbon: [19, 27, 21, 13], marseille: [18, 28, 19, 10], nice: [18, 27, 20, 11], warwick: [12, 21, 12, 5],
};
const south = new Set(['sydney', 'goldcoast', 'melbourne']);
const wetWinters = new Set(['maritime', 'subtropical', 'california-coast', 'pacific-coast']);
const evergreenCities = new Set(['mediterranean', 'desert', 'subtropical', 'california-coast', 'southern-coast', 'southern-subtropical']);
const ids = ['spring', 'summer', 'autumn', 'winter'];
const labels = ['春季', '夏季', '秋季', '冬季'];
const northernMonths = [[3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 1, 2]];
const southernMonths = [[9, 10, 11], [12, 1, 2], [3, 4, 5], [6, 7, 8]];
const palettes = ['#b5cc8b', '#b5c6a0', '#d39b58', '#a2aca0'];

function preset(data) {
  const wet = Math.max(0, Math.min(1, data.wet || 0)), snow = Math.max(0, Math.min(1, data.snow || 0));
  return Object.freeze({
    ...data, wet, snow,
    grip: Math.max(.64, Math.min(1, 1 - wet * .23 - snow * .19)),
    sky: wet >= .2 || snow > 0 ? 'cloudy' : 'clear',
    months: Object.freeze([...(data.months || [])]),
  });
}
function buildSeasons(trackId) {
  const kind = climate[trackId];
  if (kind === 'tropical') return Object.freeze([
    preset({ id: 'dry', label: '乾季', description: '相對少雨的熱帶日間，棕櫚與街樹全年常綠。', temperature: trackId === 'bangkok' ? 31 : 30, wet: 0, snow: 0, foliage: '#b5c6a0', evergreen: '#a6bc94', leafCoverage: 1, hemisphere: 'tropical' }),
    preset({ id: 'wet', label: '雨季', description: '熱帶陣雨與濕潤柏油，提早煞車、平順加油。', temperature: trackId === 'bangkok' ? 29 : 28, wet: .88, snow: 0, foliage: '#a6c29a', evergreen: '#9db98b', leafCoverage: 1, hemisphere: 'tropical' }),
  ]);
  return Object.freeze(ids.map((id, index) => {
    let wet = [0, 0, .16, wetWinters.has(kind) ? .5 : .25][index], snow = 0;
    if (kind === 'mediterranean') wet = [0, 0, .28, .38][index];
    if (kind === 'desert') wet = [0, 0, 0, 0][index];
    if (kind === 'subtropical') wet = [.18, .32, .18, .4][index];
    if (kind === 'southern-subtropical') wet = [.08, .30, .12, .06][index];
    if (kind === 'southern-temperate') wet = [.16, 0, .25, .48][index];
    if (kind === 'alpine' && id === 'winter') { snow = .85; wet = .45; }
    if (kind === 'continental' && id === 'winter') { snow = trackId === 'newyork' ? .55 : .45; wet = .3; }
    // Vancouver winter selects an occasional cold/snow episode, not average winter weather.
    if (kind === 'pacific-coast' && id === 'winter') { snow = .28; wet = .55; }
    const keepsLeaves = evergreenCities.has(kind), months = (south.has(trackId) ? southernMonths : northernMonths)[index];
    let description = [
      '新綠與柔和日光，留意季節性路面濕氣。',
      '夏日日光與茂密植被，柏油溫暖、視野明亮。',
      keepsLeaves ? '溫和秋日與常綠植被，光線較柔和。' : '金褐街樹與柔和秋光，濕彎出彎需控制油門。',
      snow ? '降雪時段與薄雪路肩，抓地降低、留足煞車距離。' : '涼季天空與濕冷路面，街道不鋪設積雪。',
    ][index];
    if (kind === 'desert') description = id === 'summer' ? '炎熱乾燥的砂岩峽谷，植被稀疏、日照強烈。' : '較涼的乾燥峽谷，砂岩與耐旱灌木維持自然色。';
    if (kind === 'pacific-coast' && id === 'winter') description = '冬季寒潮的短暫降雪；港灣平常冬季以降雨為主。';
    if (south.has(trackId)) description += ` 南半球${labels[index]}（${months[0]}–${months.at(-1)}月）。`;
    return preset({
      id, label: labels[index], description, wet, snow,
      foliage: kind === 'desert' ? '#d1be96' : keepsLeaves ? (id === 'spring' ? '#b9c995' : '#b4c19d') : palettes[index],
      evergreen: id === 'winter' ? '#9bab9b' : '#aabea0',
      leafCoverage: !keepsLeaves && id === 'winter' ? .44 : 1,
      temperature: (temperatures[trackId] || temperatures.grandprix)[index], months,
      hemisphere: south.has(trackId) ? 'south' : 'north',
    });
  }));
}
const seasons = Object.freeze(Object.fromEntries(Object.keys(climate).map(id => [id, buildSeasons(id)])));
const trackId = track => typeof track === 'string' ? track : track?.theme || track?.id;

export function getSeasons(track) { return seasons[trackId(track)] || seasons.grandprix; }
export function defaultSeason(track) { const options = getSeasons(track); return options.find(value => value.id === 'summer' || value.id === 'dry') || options[0]; }
export function getSeason(track, id) { return getSeasons(track).find(value => value.id === id) || defaultSeason(track); }

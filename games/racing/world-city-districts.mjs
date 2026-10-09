import { designDistrict } from './world-city-design.mjs?v=city-drive-17';

// Districts arrange real local landscape types around the existing closed
// circuits. Fractions are authored route positions, not surveyed street maps.
// With these clockwise tracks, -1 is the outer side and +1 the inner side.
const street = (id, frontage, spacing, setback, heights, options = {}) => ({
  id, frontage, spacing, setback, heights, density: 1, gap: 2,
  skylineDensity: .8, ground: null, groundWidth: 0, trees: .22,
  facades: 'local', furniture: null, ...options,
});
const open = (id, frontage, groundWidth, options = {}) => ({
  id, frontage, spacing: 40, setback: 0, heights: [0, 0], density: 0,
  skylineDensity: 0, ground: frontage === 'beach' ? 'sand' : frontage === 'quay' || frontage === 'port' ? 'paving' : 'grass',
  groundWidth, trees: frontage === 'quay' || frontage === 'port' ? .08 : .65,
  furniture: frontage, ...options,
});
const plan = (city, rows) => Object.freeze(rows.map(([from, id, outer, inner], index) => {
  const to = rows[index + 1]?.[0] ?? 1;
  const side = value => Object.freeze({ ...designDistrict(city, value), heights: Object.freeze(value.heights), district: id, from, to });
  return Object.freeze({ id, from, to, outer: side(outer), inner: side(inner) });
}));

export const CITY_DISTRICT_PLANS = Object.freeze({
  taipei: plan('taipei', [
    [0, 'xinyi-anhe-arcades', street('apartment-shops', 'arcade', 23, 3.8, [11.4, 43], { gap: 1.4, widths: [10, 21], trees: .6 }), street('civic-arcades', 'arcade', 32, 4.4, [14.8, 54], { density: .9, widths: [13, 25], trees: .55 })],
    [.23, 'daan-green-streets', street('park-neighbourhood', 'arcade', 37, 12, [13, 23], { density: .65 }), open('park-front', 'park', 70, { trees: .85 })],
    [.44, 'xinyi-commercial-centre', street('business-towers', 'tower', 78, 19, [48, 110], { density: .85, facades: 'modern', widths: [25, 37], ground: 'grass', groundWidth: 17 }), street('office-court', 'tower', 90, 26, [36, 92], { density: .7, facades: 'modern', ground: 'grass', groundWidth: 24 })],
    [.72, 'tonghua-residential-lanes', street('older-apartments', 'arcade', 21, 3.8, [11.4, 26], { gap: 1.2, widths: [8, 16] }), street('mixed-apartments', 'arcade', 27, 4.8, [14.8, 34], { widths: [10, 19] })],
  ]),
  kualalumpur: plan('kualalumpur', [
    [0, 'klcc-park-avenue', street('park-edge-towers', 'tower', 104, 24, [58, 132], { density: .75, facades: 'modern', widths: [24, 35], ground: 'grass', groundWidth: 21 }), open('tropical-park', 'park', 116, { trees: .95 })],
    [.25, 'bukit-nanas-green-edge', open('forest-edge', 'woodland', 70, { trees: .95 }), street('setback-offices', 'tower', 87, 26, [48, 97], { density: .65, facades: 'modern', ground: 'grass', groundWidth: 21 })],
    [.47, 'klcc-highrise-courts', street('highrise-courts', 'tower', 87, 18, [65, 144], { density: .9, facades: 'modern', widths: [25, 35] }), street('urban-towers', 'tower', 112, 26, [52, 115], { density: .75, facades: 'modern' })],
    [.73, 'kampung-baru-transition', street('low-commercial-row', 'shop', 27, 6, [10, 19], { widths: [9, 15], gap: 1 }), street('tropical-residential', 'shop', 48, 15, [12, 24], { density: .6, ground: 'grass', groundWidth: 12, trees: .7 })],
  ]),
  kobe: plan('kobe', [
    [0, 'meriken-park-approach', street('harbour-warehouses', 'warehouse', 63, 13, [9, 18], { widths: [25, 42], density: .8 }), open('meriken-open-space', 'park', 90, { trees: .35, furniture: 'port' })],
    [.25, 'motomachi-commercial', street('motomachi-shops', 'shop', 31, 7, [13, 25], { widths: [12, 22] }), street('office-streets', 'tower', 60, 13, [24, 50], { density: .85 })],
    [.49, 'rokko-facing-neighbourhood', street('low-neighbourhood', 'shop', 45, 11, [11, 20], { density: .75 }), street('civic-setbacks', 'tower', 73, 19, [24, 48], { density: .6, ground: 'grass', groundWidth: 14 })],
    [.73, 'meriken-industrial-waterfront', open('working-quay', 'port', 105, { trees: 0 }), street('quayside-warehouses', 'warehouse', 69, 12, [8, 16], { widths: [28, 44], density: .7 })],
    [.98, 'harbour-gateway', open('harbour-square', 'quay', 55), street('harbour-offices', 'shop', 52, 11, [15, 28], { density: .65 })],
  ]),
  london: plan('london', [
    [0, 'westminster-stone-streets', street('brick-terraces', 'terrace', 24, 7, [14, 22], { widths: [12, 22], gap: .7 }), street('westminster-civic', 'civic', 77, 18, [21, 34], { density: .6, widths: [28, 41], ground: 'grass', groundWidth: 12 })],
    [.25, 'westminster-garden-squares', street('garden-square-terraces', 'terrace', 34, 11, [15, 24], { density: .8 }), open('garden-square', 'garden', 61)],
    [.4, 'thames-embankment', open('thames-stone-quay', 'quay', 100, { trees: .18 }), open('river-view-corridor', 'quay', 170, { trees: 0 })],
    [.7, 'southbank-civic-edge', open('southbank-walk', 'quay', 56, { trees: .15 }), street('civic-terraces', 'civic', 65, 14, [17, 28], { density: .7, widths: [24, 35] })],
    [.81, 'pimlico-brick-terraces', street('pimlico-terrace', 'terrace', 21, 7, [13, 20], { widths: [11, 19], gap: .7 }), street('brick-courtyards', 'terrace', 28, 10, [15, 23], { density: .85 })],
  ]),
  sydney: plan('sydney', [
    [0, 'rocks-harbour-edge', open('harbour-quay', 'quay', 86, { trees: .18 }), street('rocks-sandstone', 'warehouse', 34, 7, [9, 19], { widths: [14, 24], gap: 1.5 })],
    [.24, 'harbour-headland', open('harbour-headland', 'park', 94, { trees: .65 }), street('sandstone-headland', 'warehouse', 59, 17, [10, 22], { density: .5, ground: 'grass', groundWidth: 12 })],
    [.46, 'cbd-commercial-rise', street('cbd-towers', 'tower', 89, 16, [48, 120], { facades: 'modern', density: .9, widths: [24, 36] }), street('cbd-courts', 'tower', 75, 20, [38, 86], { density: .75, facades: 'modern' })],
    [.73, 'rocks-heritage-lanes', street('sandstone-terraces', 'terrace', 24, 7, [9, 16], { widths: [10, 18], gap: 1 }), street('heritage-shops', 'warehouse', 39, 9, [12, 21], { density: .9 })],
    [.97, 'harbour-return', open('harbour-return', 'quay', 84), street('rocks-return', 'warehouse', 36, 8, [10, 19])],
  ]),
  goldcoast: plan('goldcoast', [
    [0, 'surfers-beachfront', open('sand-and-palms', 'beach', 132, { trees: .6 }), street('surfers-balcony-towers', 'tower', 98, 20, [58, 143], { density: .85, widths: [24, 34], ground: 'grass', groundWidth: 17 })],
    [.24, 'coastal-park-turn', open('coastal-park', 'park', 66, { trees: .75 }), street('apartment-gardens', 'tower', 111, 23, [38, 88], { density: .6, ground: 'grass', groundWidth: 19 })],
    [.44, 'surfers-inland-commercial', street('inland-retail', 'shop', 54, 9, [12, 27], { widths: [17, 27] }), street('inland-apartments', 'tower', 91, 18, [40, 95], { density: .75 })],
    [.73, 'residential-palm-streets', street('low-residential', 'shop', 76, 18, [10, 21], { density: .55, ground: 'grass', groundWidth: 15, trees: .65 }), street('residential-apartments', 'tower', 106, 22, [28, 63], { density: .65 })],
    [.96, 'beachfront-return', open('beachfront-return', 'beach', 130), street('ocean-view-towers', 'tower', 108, 20, [52, 125], { density: .7 })],
  ]),
  melbourne: plan('melbourne', [
    [0, 'victorian-laneway-fronts', street('victorian-terraces', 'terrace', 21, 6.5, [10, 18], { widths: [9, 17], gap: .8 }), street('heritage-courts', 'warehouse', 37, 8, [13, 22])],
    [.27, 'civic-garden-edge', street('civic-fronts', 'civic', 66, 15, [18, 31], { density: .7 }), open('civic-garden', 'garden', 52)],
    [.48, 'city-office-streets', street('city-offices', 'tower', 80, 15, [42, 100], { density: .8, facades: 'modern' }), street('office-setbacks', 'tower', 92, 21, [35, 78], { density: .75, facades: 'modern' })],
    [.73, 'yarra-river-terrace', open('yarra-promenade', 'quay', 87, { trees: .45 }), street('flinders-heritage', 'warehouse', 46, 8, [14, 25], { widths: [21, 32], density: .85 })],
    [.98, 'laneway-return', street('brick-laneway', 'terrace', 23, 7, [10, 19]), street('station-approach', 'warehouse', 40, 10, [13, 22])],
  ]),
  paris: plan('paris', [
    [0, 'champ-de-mars-boulevard', street('haussmann-boulevard', 'terrace', 28, 7, [21, 28], { widths: [22, 31], gap: .5 }), open('eiffel-garden', 'garden', 115, { trees: .65 })],
    [.27, 'haussmann-residential', street('limestone-terraces', 'terrace', 27, 6.5, [21, 28], { widths: [20, 29], gap: .5 }), street('courtyard-blocks', 'terrace', 33, 8, [20, 27], { density: .9 })],
    [.51, 'stone-civic-avenue', street('civic-stone', 'civic', 70, 16, [22, 32], { density: .7, widths: [29, 39] }), street('boulevard-corners', 'terrace', 34, 10, [21, 28])],
    [.74, 'seine-stone-embankment', open('seine-promenade', 'quay', 92, { trees: .32 }), street('seine-limestone-row', 'terrace', 30, 7, [21, 28], { widths: [21, 30], gap: .5 })],
    [.98, 'eiffel-approach-return', street('stone-return', 'terrace', 29, 7, [21, 27]), open('garden-return', 'garden', 90)],
  ]),
  prague: plan('prague', [
    [0, 'old-town-pastel-lanes', street('old-town-row', 'terrace', 20, 6.5, [12, 21], { widths: [10, 18], gap: .5 }), street('old-town-courts', 'terrace', 25, 8, [13, 23], { widths: [11, 20] })],
    [.26, 'hillside-garden-view', open('hillside-garden', 'garden', 59), street('pastel-hillside', 'terrace', 44, 14, [13, 24], { density: .7 })],
    [.5, 'bohemian-civic-streets', street('civic-pastel', 'civic', 49, 11, [18, 28], { density: .8 }), street('compact-courtyards', 'terrace', 26, 7, [13, 22])],
    [.74, 'vltava-stone-bank', open('vltava-promenade', 'quay', 100, { trees: .2 }), street('river-stone-fronts', 'terrace', 31, 9, [15, 24], { density: .9 })],
    [.98, 'old-town-return', street('pastel-return', 'terrace', 22, 7, [13, 21]), street('courtyard-return', 'terrace', 27, 9, [13, 23])],
  ]),
  newcastle: plan('newcastle', [
    [0, 'warehouse-street-approach', street('brick-warehouses', 'warehouse', 36, 8, [14, 22], { widths: [22, 31], gap: 1 }), street('quayside-stone', 'terrace', 45, 11, [18, 26], { density: .85 })],
    [.23, 'tyne-quayside', open('tyne-stone-quay', 'quay', 97, { trees: .1 }), street('quayside-brick-row', 'warehouse', 38, 8, [15, 24], { widths: [23, 33] })],
    [.5, 'sloping-brick-neighbourhood', street('sloping-terraces', 'terrace', 25, 7, [11, 18], { widths: [11, 21], gap: .7 }), street('hillside-gardens', 'terrace', 62, 18, [12, 21], { density: .55, ground: 'grass', groundWidth: 14 })],
    [.77, 'grainger-stone-fronts', street('honey-stone-civic', 'civic', 55, 10, [18, 28], { widths: [23, 35], density: .85 }), street('brick-courts', 'warehouse', 48, 11, [15, 23], { density: .8 })],
  ]),
  bangkok: plan('bangkok', [
    [0, 'low-commercial-streets', street('thai-shophouses', 'shop', 16, 6, [9, 17], { widths: [6, 10], gap: .8 }), open('temple-garden-approach', 'garden', 83, { trees: .75 })],
    [.26, 'temple-and-neighbourhood', street('temple-quarter-shops', 'shop', 23, 7, [10, 19], { widths: [7, 12], density: .9 }), open('temple-court', 'garden', 65, { trees: .5 })],
    [.49, 'riverside-commercial-rise', street('setback-business', 'tower', 83, 19, [38, 83], { density: .65, facades: 'modern' }), street('mixed-commercial', 'shop', 29, 8, [12, 24])],
    [.73, 'chao-phraya-river-edge', open('river-promenade', 'quay', 111, { trees: .45 }), street('river-commercial-row', 'shop', 23, 7, [10, 20], { widths: [7, 12], density: .85 })],
    [.98, 'old-commercial-return', street('shop-return', 'shop', 18, 6, [10, 17]), open('garden-return', 'garden', 56)],
  ]),
  sanfrancisco: plan('sanfrancisco', [
    [0, 'victorian-hill-streets', street('timber-hill-houses', 'residential', 18, 7, [9, 16], { widths: [8, 13], gap: 1 }), street('porch-houses', 'residential', 27, 11, [10, 17], { density: .9, ground: 'grass', groundWidth: 6 })],
    [.215, 'marina-bay-headland', open('bay-headland-cypress', 'cliff', 115, { ground: 'rock', trees: .7 }), street('hilltop-wooden-houses', 'residential', 55, 18, [9, 15], { density: .5, ground: 'grass', groundWidth: 14 })],
    [.45, 'hillside-residential', street('painted-hill-row', 'residential', 21, 8, [10, 18], { widths: [9, 15], density: .95 }), street('garden-houses', 'residential', 39, 15, [9, 15], { density: .7, ground: 'grass', groundWidth: 11 })],
    [.73, 'urban-corner-blocks', street('mixed-corner-blocks', 'shop', 40, 9, [15, 26], { density: .8 }), street('timber-return', 'residential', 23, 8, [10, 17], { widths: [9, 15] })],
  ]),
  newyork: plan('newyork', [
    [0, 'manhattan-street-canyon', street('tenement-wall', 'terrace', 26, 7, [27, 48], { widths: [18, 26], gap: .5, trees: .07 }), street('office-street-wall', 'tower', 55, 9, [58, 124], { widths: [26, 37], facades: 'modern', gap: 1, trees: .04 })],
    [.235, 'east-river-waterfront', open('waterfront-park', 'park', 100, { trees: .65, furniture: 'quay' }), street('waterfront-towers', 'tower', 89, 19, [55, 117], { density: .7, facades: 'modern' })],
    [.485, 'dense-manhattan-grid', street('brick-street-wall', 'terrace', 25, 7, [24, 43], { widths: [17, 25], gap: .5, trees: .08 }), street('setback-office-wall', 'tower', 61, 10, [53, 113], { facades: 'modern', widths: [28, 38], trees: .1 })],
    [.77, 'brownstone-courtyards', street('lower-neighbourhood', 'terrace', 24, 8, [16, 29], { widths: [12, 22], gap: 1 }), street('garden-courtyards', 'terrace', 43, 14, [20, 36], { density: .75, ground: 'grass', groundWidth: 10 })],
  ]),
  vancouver: plan('vancouver', [
    [0, 'coal-harbour-seawall', open('seawall-and-cedars', 'park', 112, { trees: .75, furniture: 'quay' }), street('coal-harbour-towers', 'tower', 103, 22, [54, 113], { density: .8, widths: [23, 33], ground: 'grass', groundWidth: 17 })],
    [.24, 'stanley-park-edge', open('cedar-forest-edge', 'woodland', 106, { trees: .95 }), street('park-side-residences', 'tower', 121, 25, [35, 73], { density: .55, ground: 'grass', groundWidth: 20 })],
    [.455, 'downtown-glass-streets', street('glass-apartment-courts', 'tower', 78, 17, [45, 100], { density: .9 }), street('glass-urban-fronts', 'tower', 89, 19, [58, 124], { density: .85 })],
    [.73, 'residential-green-streets', street('low-residential', 'shop', 55, 13, [12, 26], { density: .7, ground: 'grass', groundWidth: 8 }), street('green-apartment-courts', 'tower', 100, 23, [34, 73], { density: .65, ground: 'grass', groundWidth: 18 })],
    [.965, 'coal-harbour-return', open('seawall-return', 'park', 92, { furniture: 'quay' }), street('harbour-return-towers', 'tower', 111, 21, [53, 106], { density: .7 })],
  ]),
  hanoi: plan('hanoi', [
    [0, 'old-quarter-lake-approach', street('narrow-tube-houses', 'shop', 12, 5.5, [9, 17], { widths: [5, 8], gap: .5 }), open('lake-side-garden', 'park', 156, { trees: .7, furniture: 'lake' })],
    [.28, 'hoan-kiem-north-edge', street('old-quarter-trades', 'shop', 13, 6, [10, 18], { widths: [5, 8], gap: .5 }), open('lake-promenade', 'park', 132, { trees: .7, furniture: 'lake' })],
    [.54, 'compact-shop-turn', street('corner-tube-houses', 'shop', 14, 6, [10, 18], { widths: [5, 9], gap: .8 }), open('lake-corner-view', 'park', 128, { trees: .55, furniture: 'lake' })],
    [.63, 'hoan-kiem-south-walk', street('low-lakefront-shops', 'shop', 20, 7, [9, 16], { widths: [6, 10], density: .9 }), open('south-lake-garden', 'park', 151, { trees: .75, furniture: 'lake' })],
    [.9, 'old-quarter-return', street('tube-house-return', 'shop', 12, 6, [9, 17], { widths: [5, 8], gap: .5 }), street('residential-return', 'shop', 22, 8, [10, 18], { density: .8 })],
  ]),
  lisbon: plan('lisbon', [
    [0, 'alfama-tiled-hills', street('tiled-hill-row', 'terrace', 18, 6.5, [10, 18], { widths: [8, 15], gap: .5 }), street('hillside-courts', 'terrace', 26, 10, [12, 22], { density: .9 })],
    [.25, 'hilltop-miradouro', open('hilltop-garden', 'garden', 60, { furniture: 'steps', trees: .35 }), street('pastel-hill-fronts', 'terrace', 43, 15, [10, 19], { density: .6, ground: 'grass', groundWidth: 11 })],
    [.48, 'baixa-compact-streets', street('baixa-tiled-row', 'terrace', 24, 7, [17, 25], { widths: [12, 20], gap: .5 }), street('civic-stone-fronts', 'civic', 55, 12, [18, 28], { density: .8 })],
    [.695, 'tagus-river-promenade', open('tagus-stone-quay', 'quay', 106, { trees: .15 }), street('riverfront-plaster', 'terrace', 34, 8, [12, 21], { density: .85 })],
    [.97, 'alfama-return', street('tiled-return', 'terrace', 21, 7, [11, 19]), street('pastel-return', 'terrace', 28, 10, [12, 21])],
  ]),
  marseille: plan('marseille', [
    [0, 'panier-dense-streets', street('panier-plaster-row', 'terrace', 23, 6.5, [15, 23], { widths: [10, 19], gap: .7 }), street('old-town-courts', 'terrace', 31, 9, [16, 25], { density: .9 })],
    [.26, 'provencal-hill-edge', street('hill-neighbourhood', 'terrace', 49, 15, [13, 21], { density: .6, ground: 'grass', groundWidth: 11 }), open('hill-garden-view', 'garden', 68, { trees: .55 })],
    [.48, 'port-commercial-blocks', street('port-commercial-row', 'warehouse', 42, 9, [15, 24], { widths: [21, 31] }), street('stone-civic-bays', 'civic', 61, 13, [19, 29], { density: .75 })],
    [.7, 'vieux-port-quays', open('working-port-quay', 'port', 108, { trees: .05 }), street('port-frontage', 'warehouse', 41, 8, [17, 25], { widths: [24, 33] })],
    [.965, 'old-port-return', street('port-return-shops', 'terrace', 26, 7, [15, 23]), street('plaster-return', 'terrace', 31, 9, [16, 24])],
  ]),
  nice: plan('nice', [
    [0, 'promenade-des-anglais', open('pebble-beach-and-palms', 'beach', 128, { ground: 'pebble', trees: .6, furniture: 'promenade' }), street('pale-seafront-hotels', 'hotel', 61, 13, [21, 32], { widths: [29, 43], density: .9 })],
    [.27, 'riviera-park-turn', open('riviera-park', 'garden', 61, { trees: .65 }), street('hotel-courtyards', 'hotel', 83, 18, [19, 30], { density: .6 })],
    [.49, 'vieux-nice-lanes', street('ochre-old-town', 'terrace', 22, 6.5, [14, 22], { widths: [10, 18], gap: .7 }), street('old-town-courts', 'terrace', 28, 8, [15, 24], { density: .9 })],
    [.76, 'french-civic-boulevards', street('civic-frontage', 'civic', 63, 14, [20, 31], { density: .7 }), street('residential-frontage', 'terrace', 40, 10, [17, 25], { density: .8 })],
    [.975, 'promenade-return', open('pebble-beach-return', 'beach', 125, { ground: 'pebble', furniture: 'promenade' }), street('hotel-return', 'hotel', 65, 13, [21, 31])],
  ]),
  warwick: plan('warwick', [
    [0, 'castle-lawn-and-town', street('tudor-town-fronts', 'village', 24, 7, [6, 11], { widths: [9, 16], density: .9 }), open('castle-outer-lawns', 'garden', 143, { trees: .65 })],
    [.24, 'warwickshire-green-edge', open('english-meadow', 'park', 88, { trees: .5 }), open('oak-grove', 'woodland', 67, { trees: .9 })],
    [.45, 'low-sandstone-town', street('sandstone-town', 'village', 35, 10, [6, 10], { widths: [10, 17], density: .75 }), street('garden-houses', 'village', 57, 18, [6, 10], { density: .45, ground: 'grass', groundWidth: 13 })],
    [.69, 'avon-meadow-bank', open('avon-grass-bank', 'park', 95, { trees: .45, furniture: 'quay' }), street('low-river-houses', 'village', 68, 18, [6, 10], { density: .45, ground: 'grass', groundWidth: 12 })],
    [.97, 'tudor-town-return', street('tudor-return', 'village', 28, 8, [6, 11]), open('castle-return-garden', 'garden', 70)],
  ]),
});

export function cityDistrictAt(track, distance, side = 1) {
  const districts = CITY_DISTRICT_PLANS[track.theme ?? track.id];
  if (!districts || !Number.isFinite(distance) || !(track.length > 0)) return null;
  const fraction = ((distance % track.length) + track.length) % track.length / track.length;
  const segment = districts.find(district => fraction >= district.from && fraction < district.to) ?? districts[0];
  return side < 0 ? segment.outer : segment.inner;
}

export function cityDistrictForPoint(track, x, z) {
  const nearest = track.nearest(x, z);
  return cityDistrictAt(track, nearest.s, nearest.offset < 0 ? -1 : 1);
}

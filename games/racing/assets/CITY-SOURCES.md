# City scenery references

The nineteen city scenes use original procedural meshes and original generated façade,
foliage, clock and street-sign textures. No photographs from these references are
redistributed with the game. Landmark heights and defining architectural features
follow the primary references below. The playable circuits are fictional closed-course
adaptations of each city's setting; they are not surveyed street replicas.

## Taipei

- Taipei City Department of Finance, Taipei 101: 101 above-ground floors, 508 m height,
  Xinyi district location. https://land.dof.gov.taipei/cp.aspx?n=F2C9F6EA2A053B01
- National Center for Research on Earthquake Engineering, structural design of Taipei 101:
  stacked tapered modules and structural proportions.
  https://conf.ncree.org.tw/download/i0981026-structural%20design%20of%20taipei%20101%20tower.pdf

## Kuala Lumpur

- PETRONAS Twin Towers official architecture: 452 m, 88 storeys, eight-pointed star
  floor plan, stainless steel and glass, two-level skybridge at 170 m, 58.4 m length.
  https://www.petronastwintowers.com.my/the-towers/design-structure/
- Structural engineer Thornton Tomasetti: twin tower pinnacles, bridge levels and park setting.
  https://www.thorntontomasetti.com/project/petronas-twin-towers

## Kobe

- Kobe Port Tower official site: red lattice waterfront landmark and observation levels.
  https://www.kobe-port-tower.com/en/
- Kobe tourism's official night-view guide: maritime museum roof inspired by ship sails
  and ocean waves. https://www.feel-kobe.jp/kobe-yakei/en/spots/kobe-maritime-museum/
- Kobe Maritime Museum official museum guide. https://kobe-maritime-museum.com/guide/

## London

- UK Parliament, Elizabeth Tower facts: 96 m height and four opal-glass clock dials.
  https://www.parliament.uk/about/living-heritage/building/palace/big-ben/facts-figures/
- UK Parliament, Westminster palace and Gothic tower design.
  https://www.parliament.uk/about/living-heritage/building/palace/big-ben/building-clock-tower/designing-a-new-palace-of-westminster/
- London Eye official design/history: 135 m height, 32 capsules, South Bank river setting.
  https://www.londoneye.com/about-us/
  https://www.londoneye.com/plan-your-visit/information-and-support/faqs/

For the additional cities, see [Australian city references](CITY-AU-SOURCES.md),
[North American city references](CITY-NA-SOURCES.md) and
[European city references](CITY-EU-SOURCES.md), plus
[Bangkok and Hanoi references](CITY-EXTRA-SOURCES.md).

## Inspected real-scene photographs

Viewed 8 October 2026, for original modelling and material colours only. No
reference photographs are bundled with the game.

- Taipei: [Taipei 101 official photo gallery](https://www.taipei-101.com.tw/tw/explore/photogallery), [daytime exterior](https://www.taipei-101.com.tw/asset/img/imagebank/day/photogallery-day-1.jpg). Green-blue glass, stacked splayed modules, pale horizontal metal bands and an urban tree canopy inform the tower materials and narrow view corridor.
- Kuala Lumpur: [PETRONAS official design photography](https://www.petronastwintowers.com.my/the-towers/design-structure/), [close exterior](https://www.petronastwintowers.com.my/wp-content/uploads/2024/01/design-banner.png). Reflective silver floor bands, darker gray glass, cylindrical lobes and stepped tower setbacks inform the cooler glass colour and shared modern skyline profiles.
- Kobe: [Kobe tourism maritime museum photo gallery](https://www.feel-kobe.jp/kobe-yakei/en/spots/kobe-maritime-museum/), [lattice roof and Port Tower](https://www.feel-kobe.jp/kobe-yakei/assets/media/L1121052_resize-1024x682.jpg). The museum roof rises into pointed sail-like corners above lower saddle surfaces, prompting a geometric roof-profile correction.
- London: [Visit London's Westminster street photography](https://www.visitlondon.com/things-to-do/london-areas/westminster), especially its Whitehall exterior photograph. Projecting pale stone cornices, deep tall windows, pilasters and ornate roof forms inform the common street trim and recessed facades.

## Independently authored city streets

`CITY_STREET_PROFILES` in `world-cities.js` explicitly sets the scale, skyline
sector, foreground geometry family, roof, window-to-wall proportion, palette,
lamps and vegetation for each of the nineteen city maps. These are individual
scenic interpretations of the reference photographs, not surveyed street scans.

| City | Original foreground / skyline treatment |
| --- | --- |
| Taipei | Narrow Xinyi mixed-use arcades, midrise concrete frontage, twin-arm street lamps, large subtropical trees; green-gray office towers grouped inland. |
| Kuala Lumpur | Lower KLCC frontage and dense tropical planting; taller rounded glass shafts with silver floor bands in an inland skyline sector. |
| Kobe | Low pale maritime-office slabs, open harbour sector and restrained broadleaf planting; office skyline kept north of the port. |
| London | Westminster stone mixed with brick terraces, tall narrow sash windows, varied slate/parapet roofs, lanterns and plane trees. |
| Sydney | Low sandstone Rocks frontage with pitched and parapet roofs, gum trees and harbour lamps; varied taller glass CBD towers inland. |
| Gold Coast | Slim white/beige residential towers with projecting balconies, blue glazing, palms and resort lamps; beach side kept open. |
| Melbourne | Short warm Victorian laneway frontages with ornate parapets, plane trees and tram-style street fixtures; taller modern towers inland. |
| Paris | Six-storey cream limestone frontage, narrow tall windows, actual mansards/dormers, cornices and balconies, lanterns and plane-tree boulevard. |
| Prague | Lower pastel streets, narrow shutter windows, red tiled roofs and stepped gables; compact roofscape without office-tower grid. |
| Newcastle | Brick and honey-stone quayside warehouses, narrow sash openings and slate roofs; taller green Tyne Bridge remains the local silhouette. |
| Bangkok | Narrow low-rise cream shophouses with rail balconies, canopies and roof service tanks; taller modern hotel/office forms farther inland. |
| San Francisco | Low pastel Victorian bay-window houses, pitched gables, cypress trees and hillside masonry; the bay side stays open. |
| New York | Taller masonry blocks with exterior fire escapes, cornices, rooftop wooden water tanks and setback towers; mixed brown/red/limestone street palette. |
| Vancouver | Slender green-blue residential glass, pale balcony bands, cedar planting and harbour lamps; open Coal Harbour and mountain backdrop. |
| Hanoi | 5–8 m-wide ochre Old Quarter tube houses, 3–5 storeys, shutter windows, rail balconies, flat/parapet roofs and large banyan-like crowns; no generic high-rise grid. |
| Lisbon | Narrow pastel/tiled hillside houses, red roofs, shutters, low lamps and olive-sized trees; northern roofscape above open Tagus frontage. |
| Marseille | Five/six-storey Provençal port frontage, ochre limestone, narrow shutters and terracotta roofs; quay lamps and plane trees. |
| Nice | Pale pink/ochre Riviera buildings with shutters and balconies, red roofs, palms and spherical resort lamps; open pebble beach and sea frontage. |
| Warwick | Two/three-storey sandstone and exposed-timber houses, steep gables, low lanterns and oak crowns; dispersed village background without urban towers. |

Street buildings remain merged by material. Standard/mobile quality now retains
opaque architectural shadows; high quality additionally enables foliage shadows.
Water, road markings and transparent materials never cast. Each extra landmark
module keeps its own shadow policy. Only the selected scene is generated.

## Final scene comparisons

The playable start views were inspected individually, with audio muted. Taipei's
near street now mixes recessed windows in concrete wall bays with newer glass
frontage, while Kuala Lumpur includes rounded shafts and silver floor bands at
street scale. London and Newcastle now place projecting cornices and window sills on
physical storeys, rather than adding trims unrelated to the painted windows. The Kobe museum's lattice follows opposite
high corners of an asymmetric saddle, rather than a repeated U-shaped trough.
Kobe's obsolete close mountain mound was removed: the separately credited real
Mt Maya photograph and distant geographic silhouette now establish the north
side of the harbour without overlapping pale geometric hills.

## Taipei street-detail pass

Viewed 9 October 2026 in the browser, then compared against quiet playable
summer and autumn views. These photographs remain reference only and are not
used as textures, atlases, screenshots or billboards in the shipped game:

- [Xinyi / Keelung Road intersection, 21 July 2010](https://commons.wikimedia.org/wiki/File:Xinyi_Road_and_Keelung_Road_intersection_20100721b.jpg), original photograph by Lord Koxinga, CC BY-SA 3.0. Broad aluminium window ribbons, tiled midrise walls, shaded arcades and repeated street-tree planting inform the original street construction. The old footbridge and historical advertising are not reconstructed.
- [Xinyi Anhe Building, 12 January 2019](https://commons.wikimedia.org/wiki/File:Xinyi_Anhe_Building_20190112.jpg), original photograph by Solomon203, CC BY-SA 4.0. The photograph distinguishes warm panelled commercial facades, reflective glass and narrower service windows from nearby residential wall/window patterns.
- [TICC east side, 6 February 2021](https://commons.wikimedia.org/wiki/File:Taipei_International_Convention_Center_east_side_20210206.jpg), photograph by 玄史生, CC0 1.0, reviewed at Commons. Pink stone panels, pale horizontal bands, stepped upper volumes and deep upper openings inform the original TICC landmark replacing the anonymous Xinyi podium. [The operator's site](https://www.ticc.com.tw/wSite/mp?mp=1) identifies the convention centre on Xinyi Road Section 5.

`world-city-taipei-facades.js` paints six independently patterned Taiwan tile,
concrete and commercial-glass facades; frames, blinds, ventilation grilles,
rain streaks and service equipment are original artwork. Near-street Taipei
upper floors project over a recessed 3 m shop frontage, with separate arcade
columns, original fictional Chinese shop names and painted shop interiors.
The street pass adds slab edges, service balconies, downpipes, rooftop parapets
and shared paved sidewalk textures. Street trees use a curb-side position and
oriented footprint clearance, rather than being excluded by oversized circular
building bounds. The subsequent comparison pass separates warm tiled ribbon
windows, mint narrow window bays, peach small openings, ochre vertical openings
and blue/green glass offices. Foreground heights span 13–46 m, with stepped upper
floors and lower corner wings. Three original vertical shop signs project toward
the arcade edge. Leaf colours and a restrained backlighting approximation keep
the dense subtropical crowns readable. None of these details are extrapolated
to another city.

The existing six facade atlases keep their 512×1024 desktop / 256×512 mobile
dimensions. Only the selected Taipei scene allocates the additional 512×256
desktop / 256×128 mobile storefront texture and 256×256 / 128×128 paving
texture. All store interiors share one material batch; no remote street textures
or large new model downloads are required. Three shared 128×512 desktop / 64×256
mobile vertical-sign maps add 0.197 million / 0.049 million pixels. The final
Taipei city scenery now occupies 39 desktop / 40 mobile merged material batches,
including one shared physical-facade wall atlas and one additional phone upper
surface batch that reuses the same map. The full geometry tests check
road clearance, material disposal and the 300,000-triangle mobile architecture
limit. Mocked-canvas Node construction is not a real mobile GPU or browser
startup benchmark; the current scene counts are in the matrix below.

## Ground-view street comparison and junctions, 9 October 2026

The Taipei pass additionally compares these ground-level photographs as pixels:

- [Xinyi Road Section 4 / Anhe Road junction, 13 November 2019](https://commons.wikimedia.org/wiki/File:%E4%BF%A1%E7%BE%A9%E8%B7%AF%E5%9B%9B%E6%AE%B5_201911.jpg), Wpcpey, CC BY 4.0. Red curved kerbs, tiled pavement, a burnt-brick corner building, overhead traffic lights, scooter waiting boxes and asphalt repairs guide the first junction. The wide-angle image is not used to derive surveyed dimensions.
- [Anhe Road shop, 10 April 2022](https://commons.wikimedia.org/wiki/File:An-He_Shop,_Evergreen_Laurel_Wine_Collection_20220410.jpg), Solomon203, CC BY-SA 4.0. Brick upper floors, a pale stone base, corner-wrapping low signage, service equipment and recessed balcony guide corner-facing shop geometry; this reference does not imply every Taipei shop has a colonnade.
- [Xinyi / Yongkang bus shelter and bicycle parking, 11 March 2024](https://commons.wikimedia.org/wiki/File:Xinyi_%26_Yongkang_Intersection_bus_shelter_and_parked_bicycles_20240311.jpg), MAm ROFOW 022, CC0. Organized street parking, low paving and red kerbs guide street furniture scale.

`world-city-taipei-streets.js` authors five junction/side-lane openings, shared
signal heads, zebra approaches, stop bars, scooter waiting areas, three lanes
per direction, paired yellow centre lines, red kerbs and differently tinted
asphalt repairs. The first 105 m junction has occupied side streets and corner
shops in several building heights; it no longer exposes a large empty plane
behind the arcade row. Rounded scooter body shells, mirrors, seats and wheel
centres distinguish parked scooters, with deliberately limited density on
mobile. Parked taxis are outside the physical racing boundary. Low portable
race barriers close side-street entrances at that same boundary; players cannot
turn into a visible side street and encounter an unmarked collision wall.

All these photographs remain reference only. The burnt-brick facade, pink/grey
junction paving, shops and signs are original canvas drawings. Actual route
geometry and landmark placement remain scenic adaptations rather than a 1:1
Xinyi street reconstruction.

## Independent streetfront pass, 9 October 2026

`world-city-streetfronts.js` replaces the old common small-brick/window-grid
painting in fifteen city scenes. The six selected-city atlases retain their
512×1024 desktop / 256×512 mobile sizes. This module defines independently
drawn masonry and openings for each city; no additional facade photographs are
downloaded at startup. Heritage shops share one original four-variant interior
atlas per selected scene, with distinct painted wall, door and window patterns,
small individual fascias and recessed entrances. Road names remain road names;
store signs now describe original fictional local businesses.

| City | Changes in this pass |
| --- | --- |
| Kuala Lumpur | Office glazing mixed with concrete shade bays; mapped rounded shafts, floor bands following taper, small circular roof caps; curb-side tropical trees and KLCC-area planting. |
| London | Fine brick versus larger stone, actual recessed sash bays on 3.45 m architectural storeys, pale lower shop floors, white/black street plaques, four British shop interiors, door reveals and downpipes; selected first-floor iron balconies and modest roof pavilions. |
| Sydney | Coursed sandstone and arched sash openings distinguish The Rocks from CBD glazing; mixed flat/parapet/pitched roofs; revised overlapping swept shell surfaces and inclined Opera House glazing. |
| Gold Coast | Residential sliding-door and glass-balcony atlases replace office grids; full-height balcony slabs remain; duplicate small projecting balconies removed; broader curved pinnate palm foliage. |
| Melbourne | Victorian brick/ashlar, arch openings and pilasters; geometric parapet piers and pediments; separate shop bays and original brick paving. |
| San Francisco | Pastel horizontal timber cladding, sash trim, complete front-facing gables, attic windows, porch entries and stepped stoops; retail awnings removed from residential houses. |
| New York | Tenement masonry, tighter sash rhythm and window AC details; recessed local deli/bookshop/laundry entries; existing fire escapes, setbacks and rooftop tanks retained. |
| Vancouver | Residential sea-green glazing and balcony rail atlas; cedar crowns now show branch layers and needle cards instead of solid cones. |
| Paris | Large cream limestone courses, tall French windows and iron rails; individual shop fascias and recessed interiors, slab paving; green approaches and plane-tree groups surround the preserved Eiffel esplanade. |
| Prague | Pastel stucco, narrow moulded windows, some pediment trim and front-facing filled gables; separate shop interiors and small sett paving. |
| Newcastle | Brick warehouses versus honey-stone bays, quoins and arch/sash openings; British shop doors, small white street plaques and slab paving. |
| Lisbon | Complete original blue/white geometric azulejo faces mixed with plaster and shutters; iron window rails, tiled shop plinths and black/white wave paving. |
| Marseille | Weathered plaster, deep green louvred shutters and restrained iron rails; port shop doors and separate small fascias. |
| Nice | Pale Riviera plaster, arched French openings, shutters and fine rails; arched shop patterns, palm foliage and pavement distinct from Marseille. |
| Warwick | Timber/plaster mixed with brick and stone; leaded panes, filled front gables and slim gable trim; small doors/shops, sett paving, a grass-covered castle bluff, visible outer lawns and oak groups; adapted 7.4 m two-way road. |

Bangkok, Hanoi and Kobe have separately authored additional street modules and
their own source record. Their common retail signs now use locally appropriate
Thai, Vietnamese and Japanese words, rather than monument or road labels.

City road paint is supplied by `world-city-roadmarkings.js` except Taipei's
junction-aware painter. Road-edge markings, asphalt shoulders and low closed
course barriers are handled in the road module. Sidewalk/lawn materials carry
the seasonal ground marker; winter snow shading can cover upward-facing ground
without frosting windows or facades. Conifer foliage is separately marked as
evergreen. Only the chosen city's geometry, canvas maps and photograph horizon
are allocated. The world resource traversal owns their material, texture,
geometry and seasonal depth-material disposal.

The geometry regression passed all 56 common/European checks, including every
city on desktop/mobile, landmark bounds, road clearance, finite indices,
material batches and disposal. After the local lawn additions, the six affected
KL/Paris/Warwick checks also passed. These checks validate geometry and resources;
they do not establish photorealism or mobile frame rate. Final native-browser
views are reviewed independently after the complete import cache version changes.
The Paris/Warwick visible-garden correction additionally passed ten targeted
common/European checks, including the unchanged Eiffel height and open archways.
After Warwick's narrower road was integrated, its four desktop/mobile common
and European geometry checks passed again. Muted native-browser screenshots
with the complete `city-drive-10` import graph confirmed that the Paris/Warwick
gardens occupy the previously empty landmark approach and that Warwick now has
one lane in each direction. The architecture batch and generated texture counts
did not increase. These scenes remain researched scenic adaptations.

## Scene resource matrix, 9 October 2026

Values below are desktop/mobile. They count only city architecture/landmark
meshes and locally generated maps; road, terrain, cars, shadow passes, HDR,
shared downloaded surface scans and the separately loaded photograph horizon
are not included. Texture numbers are pixel counts, not compressed transfer
sizes or measured GPU memory. Construction uses a mocked canvas in Node,
so timing is deliberately not presented as a real-device startup benchmark.

| City | Common batches | All architectural batches | Triangles | Generated texture MP |
| --- | ---: | ---: | ---: | ---: |
| taipei | 39/40 | 39/40 | 345,422/270,929 | 6.16/1.59 |
| kualalumpur | 33/34 | 33/34 | 198,824/144,615 | 6.03/1.56 |
| kobe | 34/35 | 43/44 | 178,634/126,367 | 6.77/1.75 |
| london | 35/36 | 35/36 | 179,546/131,648 | 6.90/2.03 |
| sydney | 29/30 | 42/43 | 169,133/125,804 | 5.98/1.62 |
| goldcoast | 31/32 | 48/49 | 220,828/166,392 | 6.24/1.57 |
| melbourne | 30/31 | 47/48 | 127,434/97,357 | 6.75/1.86 |
| paris | 29/30 | 45/46 | 431,244/297,513 | 6.88/1.92 |
| prague | 29/30 | 49/50 | 181,255/133,924 | 6.95/1.97 |
| newcastle | 31/32 | 54/55 | 236,949/174,218 | 7.05/2.00 |
| bangkok | 31/32 | 52/53 | 289,891/257,366 | 7.09/1.88 |
| sanfrancisco | 26/27 | 45/46 | 279,071/213,018 | 5.07/1.39 |
| newyork | 30/31 | 43/44 | 346,467/222,283 | 6.08/1.65 |
| vancouver | 31/32 | 47/48 | 233,654/166,294 | 6.01/1.57 |
| hanoi | 30/31 | 51/52 | 323,663/282,467 | 6.92/1.85 |
| lisbon | 29/30 | 54/55 | 178,320/134,875 | 7.83/2.20 |
| marseille | 30/31 | 53/54 | 249,450/162,941 | 6.89/1.93 |
| nice | 32/33 | 62/63 | 272,479/190,294 | 6.98/1.93 |
| warwick | 30/30 | 44/44 | 152,368/109,191 | 7.12/1.94 |

The common scene peaks at 39 desktop / 40 mobile merged material batches; all
architectural batches peak at 62 desktop / 63 mobile. Mobile architecture peaks at 297,513 triangles
in Paris, below the 300,000 limit. Mobile road and retail-sign maps are now
512×128 instead of 1024×256, while facade dimensions retain their earlier
mobile reduction. The largest mobile generated-map total is 2.20 million pixels.
The Taipei junction ground/brick maps add only selected-scene canvas assets.
Thin low-cost palm pinnate blades and layered conifer cards replace many
cylindrical leaf beams and filled cone crowns.


## Along-route district pass

The latest matrix uses the actual 64×64 / 48×48 rendered-ground sampler and
includes the terrain-diagonal clipping of the new ground bands. Each city now
has four or five asymmetric sections rather than one repeated two-sided
street strip. Open parks, harbour quays, riverbanks, beaches and forests vary
the foreground ground, tree density, furniture and sightlines alongside the
built streets. Spacing, building heights and setbacks also change by section.
Named heritage landmarks remain distinct; generic special street rows and
backstreets cannot refill the open sections. The researched plan, physical
water-side checks and primary geography references are recorded in
[CITY-DISTRICTS.md](CITY-DISTRICTS.md). No additional surface-photo download
is introduced. Geometry/resource checks and muted native screenshots remain
separate from any claim of photorealism or measured mobile performance.


## Physical street facade pass, 9 October 2026

Actual quiet game views of Taipei, London, Newcastle and Paris were compared
with ground-view photographs. Their previous opaque Box fronts and painted
windows were visibly flat; several old lintels were placed independently of the
painted window grid. The new near-street fronts have cut-away window openings,
four actual jamb faces, glazing 0.16–0.31 m behind the masonry, sash/aluminium
frames and projecting stone sills. Room glazing has deterministic warm/cool
and brightness variation, with partial cream or grey-green blinds at different
lowered heights; all reuse the same glass/white batches. Brick, stone, tile and glazing use metalness
zero. The existing scanned ground and shared shadow system remain separate.

- London: [Warwick Way, Pimlico, original Geograph photograph via Commons](https://commons.wikimedia.org/wiki/File:Warwick_Way,_Pimlico_-_geograph.org.uk_-_4336106.jpg), Chris Whippet, [original photographer submission](https://www.geograph.org.uk/photo/4336106), inspected as pixels on 9 October. Narrow three-window terraces, brick upper floors, pale stucco lower walls, smaller attic windows and first-floor iron balconies informed the bay proportions and lower/upper distinction. The blocked Westminster council PDF was not visually inspected and is not claimed as a viewed reference.
- Newcastle: [Live Theatre's own Quayside photograph](https://www.live.org.uk/sites/default/files/styles/original/public/images/Live_Works_Quayside.jpg?itok=zYv2f4w8), inspected again on 9 October. Separate three-storey brick, taller sandstone and modern pier facades have tall recessed windows and deep lower entrances; the original window-grid-independent black bands have been removed.
- Paris upper floors: [Rue Halevy windows and mansard dormers](https://commons.wikimedia.org/wiki/File:Paris_windows_and_dormer_windows,_haussmannian_facade.jpg), Vania Teofilo, own work, 21 November 2006, CC BY-SA 3.0. The viewed tall windows, deep jambs, projecting stone sills and two separate iron balcony bands inform the original physical façade.
- Paris doorway: [135 Boulevard Haussmann entrance](https://commons.wikimedia.org/wiki/File:135_Boulevard_Haussmann,_Paris_(01).jpg), inspected as a close entrance view. It informs stone joints, inset doors and projecting lintels; it is not used to infer the number or spacing of upper floors.
- Taipei: the Xinyi/Anhe and Anhe shop ground views listed above inform fine tile and brick walls, smaller mixed-height openings, exposed slab edges, aluminium frames and the deep arcade below the upper floors.

No pixels from these reference photographs are shipped. The selected city
allocates one original six-variant masonry atlas, 768×512 desktop / 384×256
mobile, adding 0.393 / 0.098 million pixels. The wall skin adds at most one
merged material batch on desktop; the phone adds another upper-surface batch
that shares the same map without another texture allocation. Only ordinary occupied near-street plots receive the new window skin;
modern towers and the open parks/waterfronts keep their prior district policy.
Desktop fronts have physical windows throughout, while the phone retains
physical detail on its first two complete upper storeys. Above them a two-
triangle face per building uses the same bay/floor grid and wall tile, with
original procedural windows, frames, room colours and blinds. Glass/window
frames have separately masked roughness of .22 / .55; masonry remains .94.
Antialiased window edges keep the narrow sash lines stable. This allocation is intentional: a phone scene remains below
300,000 architectural triangles without introducing network model downloads.
Window geometry, original atlases and unused per-scene materials follow the
existing scene disposal path. Raycaster tests verify that a ray through a window
first reaches the recessed glass rather than an opaque original Box front;
other tests check floor/bay scale, the phone cut boundary and every city's
geometry/material/disposal/mobile budget.


The quiet native phone near views of Taipei and Paris were checked again after
the upper-surface correction. Window columns, floor boundaries and wall
palettes no longer switch to a differently scaled original facade atlas above
the second upper storey. Native WebGL compilation completed without errors.
Desktop near views of Taipei, London, Newcastle and Paris were also inspected
against the source photographs. This is a visible depth/proportion improvement,
not a claim that a generic circuit has become a measured replica or a full
photogrammetric city. The final 69 tests cover all nineteen cities on both
tiers, original European landmarks, district gaps, clipped ground, material
disposal, real window ray hits, room variation and upper-grid continuity.


## Broadleaf canopy refinement after native street review

The quiet 57-view street review exposed large 4–5 m crossed foliage panels
that looked like segmented paper fans in Warwick, Melbourne and Lisbon.
Broadleaf crowns now use smaller, non-coplanar leaf clusters with independent
orientation and depth, softly curved normals and restrained diffuse colour
variation. Seven desktop / five mobile branch clusters hold eight / six small
leaf cards each. The city species/profile, trunk, existing original foliage
map and merged material batch remain shared; palm and conifer geometry are
unchanged. This is original inexpensive foliage geometry, not a new tree
photograph, model download or material batch.

The complete 38-scene before/after audit keeps every building footprint,
district-ground position hash, texture count/pixel total and material-batch
count unchanged. The local canopy seed deliberately preserves the old shared
random consumption so a tree detail cannot move a neighbouring plot or lawn.
Actual geometry saves 44 desktop / 22 mobile triangles per broadleaf tree:
Warwick saves 2,684 / 748, Melbourne 1,672 / 374 and Lisbon 1,100 / 220.
The nineteen scenes collectively save 19,008 desktop / 4,774 mobile triangles.
The existing geometry/material/road-clearance/disposal suite passes all 69
tests, including a new maximum 3.5 m foliage-card edge check. The matrix above
includes these final smaller crowns; phone architecture peaks at 297,513
triangles. No framerate or photorealistic vegetation claim is inferred from
these geometry counts.


After the final canopy revision, quiet native route-40% views of Warwick,
Melbourne and Lisbon were inspected again. The large segmented paper fans
were absent; the smaller intersecting leaf clusters retain readable crown
depth and the unchanged city layout. The physical/cheap phone upper-window
alignment and its shared-map resource limits described above remain intact.

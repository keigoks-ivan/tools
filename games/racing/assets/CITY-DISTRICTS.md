# City route districts, 9 October 2026

These layouts adapt researched local street, park and waterfront types around
the game's closed circuits. Route fractions, widths and setbacks are authored
for scenery and racing clearance; they are not a surveyed sequence of actual
public streets. The game rotates and compresses districts to fit its circuits.
References establish local character and which shore should remain open, not
an assertion of a geographically exact street map.

`world-city-districts.mjs` gives each route four or five independent sections.
Each section has separate inner/outer frontage, spacing, density, setback,
height range and ground/planting rules. Outer is side −1 and inner is side +1
on these clockwise circuits. Street placement uses the current track width
and physical wall offset. Ground and skyline rows cannot refill a density-zero
park or waterfront. Named heritage buildings can remain explicit exceptions;
ordinary special street rows and rear courts follow the same open-side rules.

| City | Along-route changes | Geographic reference |
| --- | --- | --- |
| Taipei | Tight Xinyi/Anhe apartment shops and arcades → leafy Daan park edge → widely set-back taller Xinyi offices → smaller Tonghua apartment lanes. | [Taipei City: Daan district](https://english.gov.taipei/cp.aspx?n=F9797470B11F14BD); viewed Xinyi/Anhe street photographs in CITY-SOURCES.md. Inland parks, with no invented coast. |
| Kuala Lumpur | KLCC tower frontage faces an open tropical park → a woodland edge and recessed offices → taller office courts → lower commercial/residential streets. | [Suria KLCC: KLCC Park](https://www.suriaklcc.com.my/attractions/klcc-park/), [KLCC Convention Centre location](https://www.klccconventioncentre.com/about/about-the-centre). The large green park beside the towers is a separate landscape, not another shop strip. |
| Kobe | Low harbour warehouses face Meriken open space → tighter Motomachi commercial streets → lower Rokko-facing neighbourhoods → open industrial quay and inland warehouses. | [Kobe Tourism Bureau: Meriken/Harborland](https://www.feel-kobe.jp/area-guide/meriken-harbor/), plus viewed Foreign Settlement masonry references in CITY-EXTRA-SOURCES.md. Port is south of the mountain-facing city. |
| London | Brick terraces and larger Westminster stone fronts → garden square → long open Thames embankment → civic edge → tighter Pimlico terraces. | [Visit London: Westminster](https://www.visitlondon.com/things-to-do/london-areas/westminster), [Westminster Council: Pimlico conservation audit](https://www.westminster.gov.uk/sites/default/files/media/documents/Pimlico%20Conservation%20Area%20Audit.pdf). The adapted east road follows the dry west bank; bridges remain independent geometry. |
| Sydney | Open harbour quay opposite low sandstone Rocks buildings → green headland → larger glass CBD streets → low heritage lanes → harbour return. | [Sydney Opera House: Western Broadwalk](https://www.sydneyoperahouse.com/visit/our-venues/western-broadwalk). Bennelong Point forecourt/water stay open; sandstone streets remain on land. |
| Gold Coast | Open sandy beach and palms face slim inland residential towers → coastal park → lower retail/apartment streets → low residential frontage → beach return. | [Experience Gold Coast: Surfers Paradise Beach](https://experiencegoldcoast.com/places-to-go/central-gold-coast/things-to-do/surfers-paradise-beach-au0062244). Beach-side foredunes and sand do not receive generic apartment rows. |
| Melbourne | Lower Victorian streets and warehouses → open civic garden → taller modern offices → open Yarra quay opposite heritage streets → laneway return. | [City of Melbourne: Queensbridge Square](https://whatson.melbourne.vic.gov.au/things-to-do/queensbridge-square). River plaza, station-side heritage and inland modern blocks remain distinct. |
| Paris | Dense Haussmann frontage opposite Eiffel gardens → close residential streets → larger civic fronts → open Seine stone quay → garden return. | [Eiffel Tower operator: gardens](https://www.toureiffel.paris/en/explore/gardens), viewed local architecture in CITY-EU-SOURCES.md. The existing tower esplanade is preserved inside the planted setting. |
| Prague | Close pastel old-town streets → leafy hill edge → civic fronts and open courtyard → open Vltava bank opposite low pastel streets → old-town return. | [Prague City Tourism: Charles Bridge](https://prague.eu/en/objevujte/charles-bridge-karluv-most/). Opposite-bank roofscape and bridge towers remain visible across the existing channel. |
| Newcastle | Brick warehouse/stone streets → open Tyne quay → looser slope-side brick housing → denser Grainger civic streets. | [NewcastleGateshead: Quayside](https://newcastlegateshead.com/explore/quayside), [Gateshead](https://newcastlegateshead.com/explore/gateshead). The warehouse row remains land-side; the open bank reveals the opposing Glasshouse and BALTIC. |
| Bangkok | Low commercial shop houses opposite temple gardens → smaller temple-quarter streets → taller inland office blocks → open river quay opposite low streets → shop/garden return. | [Tourism Authority of Thailand: Wat Arun](https://www.tourismthailand.org/Attraction/phraprang-wat-arun-ratchawararam-ratchawora-mahawi). The complete Wat Arun precinct stands on the dry opposite bank of the existing channel; it is not placed inside an inland park. |
| San Francisco | Tight coloured timber houses → open Marina/Bay headland opposite hill houses → denser hill housing → mixed corner streets. | [San Francisco Travel: Marina District](https://www.sftravel.com/article/top-things-to-do-san-franciscos-marina-district). This is a Bay waterfront/park character, not a generic Pacific sandy beach; game coordinates are rotated. |
| New York | Tall masonry tenements opposite deeper office fronts → open East River park opposite inland towers → close street canyon → lower brownstone courtyards. | [NYC DOT: Brooklyn Bridge](https://www.nyc.gov/html/dot/html/bridges/brooklyn_bridge.shtml). The existing East River channel and bridge approach are not filled with a second near building row. |
| Vancouver | Open seawall park faces slender glass residences → denser cedar woodland edge → glass downtown streets → green residential frontage → seawall return. | [Destination Vancouver: Vancouver by water](https://www.destinationvancouver.com/inspirations/outdoors/vancouver-by-water). Burrard Inlet and North Shore views remain open; Canada Place stays an explicit pier landmark. |
| Hanoi | Narrow Old Quarter shops face open lake gardens → tight trade streets opposite leafy lake bank → compact corner shops with open inner bank → lower commercial frontage opposite lakeside gardens → dense old-town return. | [Vietnam Tourism: Old Quarter](https://vietnam.travel/things-to-do/explore-old-quarter-your-way). The lake is on the inner side of this adapted loop; leafy bank and benches replace a continuous tube-house wall. |
| Lisbon | Dense tiled hillside fronts → open miradouro garden and looser houses → larger Baixa/civic streets → open Tagus stone quay opposite low plaster frontage → tiled return. | [Visit Lisboa: Belém Tower](https://www.visitlisboa.com/en/places/torre-de-belem), viewed tiled street references in CITY-EU-SOURCES.md. Broad estuary is outside, hillside streets are on land. |
| Marseille | Dense old-town plaster → looser hillside neighbourhood and garden → port commercial/civic blocks → open working quay opposite warehouses → old-port return. | [Marseille Tourism: ferry boat](https://www.marseille-tourisme.com/en/discover-marseille/traditions/ferry-boat/). The existing harbour basin retains opposite shores, pontoons, masts and boats. |
| Nice | Open pebble beach and palms opposite larger pale hotels → park/courtyard section → tighter ochre old town → larger civic/residential fronts → pebble-beach return. | [Nice Côte d'Azur Tourism: Promenade des Anglais](https://www.explorenicecotedazur.com/en/culture/promenade-des-anglais/). Pale buildings stay inland; beach is pebble-coloured, distinct from Gold Coast sand. |
| Warwick | Small Tudor fronts opposite open castle lawns → open meadow and oak grove → low sandstone town/garden houses → Avon meadow bank with scattered low river houses → town/garden return. | [Warwick Castle: grounds and gardens](https://www.warwick-castle.com/explore/heritage/grounds-and-gardens/). The adapted 7.4 m two-way road has one lane each way, rather than a large urban boulevard. |

The detailed facade and landmark pixel references remain in CITY-SOURCES.md,
CITY-EU-SOURCES.md, CITY-AU-SOURCES.md, CITY-NA-SOURCES.md and
CITY-EXTRA-SOURCES.md. None of the new ground surfaces downloads another street
photograph or redistributes the reference images. Small original benches,
bollards, railings, existing-material sand/grass/pebble bands and limited tree
groups give the open sections real foreground structure.

## Ground visibility and resource handling

City terrain uses a deliberately small 64×64 desktop / 48×48 mobile grid.
Authored lawn/beach faces are clipped at this rendered grid's cells and
diagonals by `world-city-ground.mjs`; they follow the actual terrain triangles
with a 4.5–4.8 cm offset. This prevents a finer analytic ground patch from being
buried by an intervening coarse terrain ridge. Each face has upward winding
and a FrontSide material; DoubleSide does not conceal incorrect ground faces.
Dry-ground checks prevent the bands from filling an existing sea, river or
lake. The main street and racing corridor are excluded from the new patches.

The new grass/sand/pebble materials reuse loaded surface maps, carry the
seasonal ground marker, and merge into material batches. Clipping adds local
vertices, not extra draw batches or textures. Only the selected city constructs
its districts and original local maps; the world traversal owns geometry,
material, texture and seasonal depth-material disposal. The scene resource
matrix in CITY-SOURCES.md is regenerated with the actual coarse-ground sampler
after the complete scene is integrated. It is a geometry/texture budget, not a
mobile frame-rate claim.

The existing sparse-grass diffuse scan contains dark exposed dry soil.
Selected-city lawn material clones normalize its linear reflectance to greener
humid-climate grass and a more restrained dry coastal palette. The shared
diffuse, normal and roughness textures are preserved. Sand and pebble materials
are separate, and winter snow shading mixes its own snow colour rather than
tinting snow green. This is original material adaptation, not a claim that the
scan was photographed in any of the represented cities.

## Verification

The common city, European landmark, district-plan and terrain-clipping suites
passed 62 tests: desktop/mobile finite geometry, corridor clearance, district
height ranges, genuinely open foregrounds, special rear-row exclusion,
material/geometry disposal, complete wraparound plans and non-coplanar terrain
diagonal coverage. An independent 38-scene rendered-ground audit inspected
469,419 ground vertices and 938,838 interior samples with zero reversed faces,
buried faces or river/sea/lake intersections. These tests measure implementation
invariants; muted native-browser views are the separate visual acceptance step.
The unified `city-drive-13` native pass additionally confirmed visible, more
restrained green lawns in Warwick/Kuala Lumpur/Hanoi and separate open lake
and occupied Old Quarter sides in Hanoi. The earlier grey-plane failure was
closed by terrain clipping, rather than by hiding it behind more buildings.

# Racing prototype asset credits

## Ferrari 458 Italia

- File: `car-ferrari458.glb` (original compressed mesh; no geometry edits).
- Author: **vicent091036**.
- Original model: https://sketchfab.com/models/57bf6cc56931426e87494f554df1dab6
- Download: https://raw.githubusercontent.com/mrdoob/three.js/r166/examples/models/gltf/ferrari.glb
- Official example and author credit: https://threejs.org/examples/webgl_materials_car.html
- License: **Creative Commons Attribution 4.0 International (CC BY 4.0)**, https://creativecommons.org/licenses/by/4.0/
- Three.js asset-license inventory: https://github.com/mrdoob/three.js/issues/23089 (lists `gltf/ferrari.glb` as CC-BY 4.0).
- Changes in the prototype: replacement physical materials, wheel animation, steering, suspension response, and a rotation to the game's coordinate system. The source model is not original game artwork.
- The source Sketchfab page was unavailable when checked on 2026-10-08; the original attribution and license inventory are preserved above.

## Vehicle contact shadow

- File: `car-ferrari458-ao.png`.
- Download: https://raw.githubusercontent.com/mrdoob/three.js/r166/examples/models/gltf/ferrari_ao.png
- Distributed with the same Three.js Ferrari example; the grayscale image is converted at runtime to a black alpha silhouette for the contact shadow.

## Libraries

- Three.js r166 loaders and utilities: Three.js authors, MIT. https://github.com/mrdoob/three.js/blob/r166/LICENSE
- Draco decoder files: Google Draco authors, Apache License 2.0. https://github.com/google/draco/blob/master/LICENSE
- Matching Draco binaries were downloaded from the Three.js r166 `examples/jsm/libs/draco/gltf/` distribution.

## Outdoor lighting and sky

- File: `environment.hdr`, 1K resolution, original HDR pixels.
- Asset: **Kloppenheim 06 (Pure Sky)**.
- Authors: **Greg Zaal** (original photography), **Jarod Guest** (sky edits).
- Source: https://polyhaven.com/a/kloppenheim_06_puresky
- Download: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloppenheim_06_puresky_1k.hdr
- License: **CC0 1.0 Universal**, https://polyhaven.com/license and https://creativecommons.org/publicdomain/zero/1.0/
- Used for photographic background and physically based material lighting. This is a pure-sky image; no location scenery is imported into the original circuit.

Ferrari and associated names and marks identify the represented vehicle. This prototype is an independent project and does not claim manufacturer affiliation.

## Concept GT

- File: `car-concept-gt.glb`.
- Asset: **Car Concept**, published in the Khronos glTF Sample Assets collection.
- Model and textures: **Eric Chadwick**, © 2024 **Darmstadt Graphics Group GmbH**.
- Original public-domain geometry: **Unity Fan**, credited by the asset's original README.
- Source and license: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept
- Downloaded source: https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb
- License: **Creative Commons Attribution 4.0 International (CC BY 4.0)**, https://creativecommons.org/licenses/by/4.0/legalcode
- Source attribution, license and metadata are preserved in `car-concept-source.md`, `car-concept-license.md`, and `car-concept-metadata.json`.
- Changes: Draco geometry compression; image textures resized to a maximum of 512 px (AO 1024 px); original material variants removed; logo texture removed and steering emblem omitted; glass adjusted for mobile; normalized dimensions and coordinate system; front wheel pose aligned; wheel rotation, steering, brake lights, suspension and original procedural contact shadow added.
- Concept GT is a game name for this unbranded concept model. The original Khronos marks have been omitted; the game does not imply endorsement by Khronos or the asset's authors.

## APEX R

- Original procedural artwork in `cars-extra.js`, created for this project.
- Sculpted coupe body, wheel arches, panoramic canopy, aero wing, detailed wheel assemblies, brake components, headlamps and tail lamps are generated locally; no third-party model or manufacturer branding is used.
- Contact shadow is an original procedural radial alpha texture.

## Photographed circuit surfaces

All files in `surfaces/` below are **Poly Haven CC0 1.0 Universal** assets. License: https://polyhaven.com/license and https://creativecommons.org/publicdomain/zero/1.0/

| Asset | Authors | Official source | Photographed tile size |
| --- | --- | --- | --- |
| Asphalt Track | Dimitrios Savva | https://polyhaven.com/a/asphalt_track | 2 m |
| Sparse Grass | Amal Kumar | https://polyhaven.com/a/sparse_grass | 2 m |
| Gravelly Sand | Dario Barresi | https://polyhaven.com/a/gravelly_sand | 2.5 m |
| Red Sand | Rohit Seervi | https://polyhaven.com/a/red_sand | 3 m |
| Rock Boulder Dry | Dimitrios Savva (photography), Rico Cilliers (processing) | https://polyhaven.com/a/rock_boulder_dry | 1.8 m |
| Concrete Wall 004 | Charlotte Baglioni (photography), Dario Barresi (processing) | https://polyhaven.com/a/concrete_wall_004 | 2 m |

Only the official 1K diffuse, OpenGL normal and roughness maps are included, not preview renders. The source JPEGs were verified against Poly Haven's published MD5 hashes and re-encoded without resizing: diffuse quality 87, GL normal quality 91 without chroma subsampling, single-channel roughness quality 87. The 18 textures total approximately 5.6 MB; only the selected circuit's material sets load at runtime. Exact source URLs, checksums, dimensions and local sizes are preserved in `surfaces/sources.json`.

Official download links:

- Asphalt Track: [diffuse](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_track/asphalt_track_diff_1k.jpg), [GL normal](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_track/asphalt_track_nor_gl_1k.jpg), [roughness](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_track/asphalt_track_rough_1k.jpg).
- Sparse Grass: [diffuse](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/sparse_grass/sparse_grass_diff_1k.jpg), [GL normal](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/sparse_grass/sparse_grass_nor_gl_1k.jpg), [roughness](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/sparse_grass/sparse_grass_rough_1k.jpg).
- Gravelly Sand: [diffuse](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/gravelly_sand/gravelly_sand_diff_1k.jpg), [GL normal](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/gravelly_sand/gravelly_sand_nor_gl_1k.jpg), [roughness](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/gravelly_sand/gravelly_sand_rough_1k.jpg).
- Red Sand: [diffuse](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/red_sand/red_sand_diff_1k.jpg), [GL normal](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/red_sand/red_sand_nor_gl_1k.jpg), [roughness](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/red_sand/red_sand_rough_1k.jpg).
- Rock Boulder Dry: [diffuse](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_boulder_dry/rock_boulder_dry_diff_1k.jpg), [GL normal](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_boulder_dry/rock_boulder_dry_nor_gl_1k.jpg), [roughness](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_boulder_dry/rock_boulder_dry_rough_1k.jpg).
- Concrete Wall 004: [diffuse](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_wall_004/concrete_wall_004_diff_1k.jpg), [GL normal](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_wall_004/concrete_wall_004_nor_gl_1k.jpg), [roughness](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_wall_004/concrete_wall_004_rough_1k.jpg).

Game material changes: physically based roughness and restrained surface normals, neutral color normalization for asphalt, metre-based UV repetition, environment lighting and original procedural terrain geometry. These photographs supply surface detail; they are not photographs of the game's fictional race circuits.

## Circuit daylight skies

The following two **pure-sky** HDRIs contain no location terrain, buildings or circuit scenery. Both files preserve the exact original 1K Radiance HDR bytes from Poly Haven, without tone mapping, resizing or recompression. Their official MD5 hashes were verified after download. All in-game landscape geometry remains original.

- File: `environment-coast.hdr`, **Kloppenheim 05 (Pure Sky)**, 1024 × 512, 1,086,297 bytes. Authors: **Greg Zaal** (original photography), **Jarod Guest** (sky edits). Source: https://polyhaven.com/a/kloppenheim_05_puresky. Official download: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloppenheim_05_puresky_1k.hdr. Source MD5: `fe0d85219b08932d0467c3752012b749`. A midday sky used for Coast and Grand Prix environment lighting and background.
- File: `environment-desert.hdr`, **Syferfontein 18d Clear (Pure Sky)**, 1024 × 512, 1,107,348 bytes. Authors: **Greg Zaal** (original photography), **Jarod Guest** (sky edits). Source: https://polyhaven.com/a/syferfontein_18d_clear_puresky. Official download: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/syferfontein_18d_clear_puresky_1k.hdr. Source MD5: `76ef39faee475a3629841e58c04e1b43`. A clear afternoon sky used for Canyon and clear city seasons. City sunlight follows the photographed sun at approximately 18° elevation; cloudy seasons retain the overcast sky. The filename does not introduce desert scenery into cities.
- Both licenses: **CC0 1.0 Universal**, https://polyhaven.com/license and https://creativecommons.org/publicdomain/zero/1.0/.

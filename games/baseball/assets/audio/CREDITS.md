# Baseball audio

The nine-second home-run fanfare is an original composition and arrangement:
132 BPM, C major, recorded trumpet and trombone, concert bass drum, snare and
cymbal. Recorded instruments are resampled, arranged, mixed and mastered by
`../../tools/make_audio.py`. It is a one-shot cue, not a commercial song excerpt.

Hit effects have three separate dynamics (soft contact, line drive, power hit),
wood-impact support and a short stadium reflection. The two glove effects use
separate recorded catches. The crowd bed has a crossfaded loop; celebrations use
a separate cheer. Only the processed audio ships. Raw samples are kept outside
the repository. All source recordings below are CC0 1.0; attribution is optional.

| Source | Use | Licence |
|---|---|---|
| [baseball bat — Luisa_Sanchez](https://freesound.org/people/Luisa_Sanchez/sounds/813396/) | Hit transient | CC0 1.0 |
| [Baseball Into Glove — keus92](https://freesound.org/people/keus92/sounds/432502/) | Leather-mitt catches | CC0 1.0 |
| [Crowd Cheering — SoundsExciting](https://freesound.org/people/SoundsExciting/sounds/365132/) | Cheer and stadium bed | CC0 1.0 |
| [Impact Sounds — Kenney](https://kenney.nl/assets/impact-sounds) | Wood support, grass step, bounce | CC0 1.0 |
| [VSCO 2 Community Edition — Sam Gossner / Simon Dalzell](https://github.com/sgossner/VSCO-2-CE) | Sampled brass and orchestral drums | CC0 1.0 |

Source licence: https://creativecommons.org/publicdomain/zero/1.0/
Kenney and VSCO licence notices are retained beside this file.

Pitch/swing air, menu pips and the fallback effects are synthesized in audio.js.
Samples preload and decode once, then Web Audio starts them at the game event.
Music ducks beneath pitches, hits and catches. The final bus has a peak limiter.

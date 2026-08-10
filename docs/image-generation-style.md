# Image Generation Style Reference

Use this reference for every original image asset generated for Handy. Adapt the subject, aspect ratio, and delivery format to the task, but preserve the visual principles and negative constraints below.

## Master prompt

> Create a refined, minimal image asset for Handy using a restrained glassmorphic visual language.
>
> **Subject:** [describe the requested subject, or use an abstract composition when no literal subject is necessary]
>
> **Format:** [aspect ratio, orientation, resolution, and whether the background should be transparent]
>
> Build the composition from one clear focal element and no more than two supporting forms. The imagery may be surreal, semantically ambiguous, or physically impossible; it does not need to explain itself. It must still feel art-directed, balanced, and deliberate.
>
> Use large areas of negative space, simple geometry, quiet asymmetry, and strong silhouette design. Favor translucent or smoked glass, subtle refraction, soft internal reflections, controlled blur, faint edge highlights, and physically plausible light passing through material. Glass should feel tactile and architectural, not glossy or decorative.
>
> Keep the palette to two or three restrained colors, primarily neutral, with at most one muted accent. Use soft directional lighting and deep tonal separation. Avoid decorative color gradients; natural light falloff inside glass is acceptable. Keep contrast sufficient for the intended placement and leave useful crop-safe space where interface copy may overlap.
>
> The final image should feel premium, editorial, calm, and slightly mysterious. Prefer fewer elements, quieter lighting, and more empty space whenever uncertain. It should look designed by a disciplined human art director—not assembled from common generative-art motifs.
>
> Do not include text, letters, numbers, logos, watermarks, interface controls, or pseudo-technical markings unless the request explicitly supplies them. Do not invent product details.
>
> **Avoid completely:** generic AI imagery, glowing brains, robot heads, circuit patterns, floating holograms, data tunnels, neon purple-blue palettes, rainbow refraction, decorative blobs, excessive bloom, strong lens flares, particle clouds, liquid chrome, busy glass cards, gratuitous depth-of-field, oversaturated lighting, symmetrical poster clichés, fake UI, illegible typography, and visual noise.
>
> Render with clean edges, coherent material behavior, restrained detail, and enough resolution for production use. The result should remain visually strong when cropped and should not depend on tiny details to work.

## Usage rules

- Replace the bracketed subject and format fields; do not rewrite the art direction from scratch.
- Add task-specific factual constraints after the master prompt.
- Use no more than one primary subject and two supporting forms unless the user explicitly asks for complexity.
- Prefer abstraction over a generic literal metaphor.
- If the first result feels busy, artificial, or recognizably “AI-generated,” remove elements and effects before adding anything.
- User-provided art direction overrides this reference when the two conflict.

## Short negative prompt

Use this when the image tool supports a separate negative prompt:

> AI clichés, generic tech imagery, glowing brain, robot, circuits, hologram, neon purple and blue, rainbow glass, blobs, liquid chrome, excessive glow, bloom, lens flare, particles, busy composition, crowded cards, fake interface, invented text, watermark, logo, oversaturation, noisy texture, cheap 3D render, stock-photo aesthetic.

---
name: Character animation approach
description: Preserve existing character identity when adding animation poses
---
Use the existing character artwork as the source for articulated cutout sprite animation rather than generating unrelated characters for each pose.

User-supplied sprite sheets take precedence over generated cutout animation for the requested creature. Preserve their pixel-art treatment and actual supplied poses.

**Why:** The visual target has already suffered from replacement placeholder artwork. Rigged cutouts preserve character identity and provide predictable frame alignment; they are an initial animation approach, not hand-drawn full-angle animation.

**How to apply:** Keep original source art intact and make animation assets replaceable. Trigger combat presentation from actual game events rather than independent repeating attack loops.
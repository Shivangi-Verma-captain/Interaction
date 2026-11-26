# Particle Portrait

Open [the portrait](portrait/dist/index.html) in a desktop browser. Everything needed to run it is in `portrait/dist`, including the point cloud derived from the supplied photograph. There is no installation step.

Move the pointer over the face or drag a finger across it. A faster stroke pulls the dots farther before they spring back. For keyboard interaction, focus the portrait, use the arrow keys to move the deformation, and press Escape to release it.

Select **Record**, interact, then select **Stop recording** and **Save video**. The browser prepares a silent video of the scene, including the gradient. Recording uses the browser's supported WebM or MP4 format and holds the frame dimensions steady until you stop.

## Source

- `portrait/dist/portrait.js` handles the particle springs, pointer input, and responsive framing.
- `portrait/dist/renderer.js` draws the particles and lighting using WebGL, with a Canvas 2D fallback.
- `portrait/dist/recording.js` records the canvas locally.
- `portrait/tools/build_portrait.py` samples the facial details inside a hand-traced outline and extends the cropped crown. To rebuild the points, run `python portrait/tools/build_portrait.py "path/to/original.png"` with NumPy and Pillow installed. The sampling coordinates are fitted to the original photograph.

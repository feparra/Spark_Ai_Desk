import os
import shutil
import cv2
import numpy as np
from PIL import Image, ImageSequence

def detect_chroma_type(corner_pixels):
    avg_r = np.mean([p[0] for p in corner_pixels])
    avg_g = np.mean([p[1] for p in corner_pixels])
    avg_b = np.mean([p[2] for p in corner_pixels])

    if avg_g > 100 and avg_g > (avg_r + 30) and avg_g > (avg_b + 30):
        return 'green'
    elif avg_r > 100 and avg_b > 100 and avg_g < 80:
        return 'magenta'
    elif avg_r < 30 and avg_g < 30 and avg_b < 30:
        return 'black'
    return 'unknown'

def remove_background_from_gif(input_gif, output_gif, target_size=180):
    if not os.path.exists(input_gif):
        return False

    im = Image.open(input_gif)
    frames = []
    durations = []

    chroma_type = None

    for frame in ImageSequence.Iterator(im):
        duration = frame.info.get('duration', 80)
        durations.append(duration)

        frame_rgb = frame.convert('RGB')
        arr = np.array(frame_rgb)
        h, w = arr.shape[:2]

        resized = cv2.resize(arr, (target_size, target_size), interpolation=cv2.INTER_AREA)
        rgba = cv2.cvtColor(resized, cv2.COLOR_RGB2RGBA)

        # Detect chroma type on the first frame
        if chroma_type is None:
            corners = [resized[0, 0], resized[0, -1], resized[-1, 0], resized[-1, -1]]
            chroma_type = detect_chroma_type(corners)
            print(f"[{os.path.basename(output_gif)}] Detected Chroma Type: {chroma_type.upper()}")

        if chroma_type == 'green':
            hsv = cv2.cvtColor(resized, cv2.COLOR_RGB2HSV)
            lower_green = np.array([35, 60, 60])
            upper_green = np.array([85, 255, 255])
            green_mask = cv2.inRange(hsv, lower_green, upper_green)
            rgba[green_mask > 0, 3] = 0

            # Green spill suppression on edges
            r = rgba[:, :, 0].astype(np.float32)
            g = rgba[:, :, 1].astype(np.float32)
            b = rgba[:, :, 2].astype(np.float32)
            spill_mask = (g > r + 30) & (g > b + 30) & (rgba[:, :, 3] > 0)
            rgba[spill_mask, 1] = np.clip((r[spill_mask] + b[spill_mask]) / 2, 0, 255).astype(np.uint8)

        elif chroma_type == 'magenta':
            hsv = cv2.cvtColor(resized, cv2.COLOR_RGB2HSV)
            lower_magenta = np.array([135, 50, 50])
            upper_magenta = np.array([175, 255, 255])
            magenta_mask = cv2.inRange(hsv, lower_magenta, upper_magenta)
            rgba[magenta_mask > 0, 3] = 0

            # Magenta spill suppression on edges
            r = rgba[:, :, 0].astype(np.float32)
            g = rgba[:, :, 1].astype(np.float32)
            b = rgba[:, :, 2].astype(np.float32)
            spill_mask = (r > g + 40) & (b > g + 40) & (rgba[:, :, 3] > 0)
            rgba[spill_mask, 0] = np.clip((g[spill_mask] + b[spill_mask]) / 2, 0, 255).astype(np.uint8)
            rgba[spill_mask, 2] = np.clip((g[spill_mask] + r[spill_mask]) / 2, 0, 255).astype(np.uint8)

        elif chroma_type == 'black':
            # Flood fill from 4 corners
            threshold = 22
            h_r, w_r = resized.shape[:2]
            bg_mask = np.zeros((h_r + 2, w_r + 2), np.uint8)
            gray = cv2.cvtColor(resized, cv2.COLOR_RGB2GRAY)
            cv2.floodFill(gray, bg_mask, (0, 0), 0, loDiff=threshold, upDiff=threshold)
            cv2.floodFill(gray, bg_mask, (w_r - 1, 0), 0, loDiff=threshold, upDiff=threshold)
            cv2.floodFill(gray, bg_mask, (0, h_r - 1), 0, loDiff=threshold, upDiff=threshold)
            cv2.floodFill(gray, bg_mask, (w_r - 1, h_r - 1), 0, loDiff=threshold, upDiff=threshold)
            rgba[bg_mask[1:-1, 1:-1] == 1, 3] = 0

        frames.append(Image.fromarray(rgba))

    if frames:
        avg_duration = int(np.mean(durations)) if durations else 80
        frames[0].save(
            output_gif,
            save_all=True,
            append_images=frames[1:],
            loop=0,
            duration=avg_duration,
            disposal=2,
            transparency=0
        )
        print(f"[OK] Successfully saved transparent GIF: {os.path.basename(output_gif)}")
        return True
    return False

def process_all():
    base_dir = r"g:\My Drive\04_Desarrollo_AI\Spark_Desktop\assets"
    icons_dir = os.path.join(base_dir, "icons")
    os.makedirs(icons_dir, exist_ok=True)

    characters = ["dr_octopus", "astro", "kitty", "llama", "piper", "capy"]
    states = ["calm", "working", "waiting", "done", "error"]

    for char in characters:
        char_dir = os.path.join(base_dir, char)
        if not os.path.exists(char_dir):
            continue

        raw_dir = os.path.join(char_dir, "raw_green")
        os.makedirs(raw_dir, exist_ok=True)

        print(f"\n--- Processing {char.upper()} ---")
        for state in states:
            gif_path = os.path.join(char_dir, f"{state}.gif")
            raw_backup = os.path.join(raw_dir, f"{state}.gif")

            if os.path.exists(gif_path):
                # If raw backup doesn't exist, store the source
                if not os.path.exists(raw_backup):
                    shutil.copyfile(gif_path, raw_backup)
                
                remove_background_from_gif(raw_backup, gif_path, target_size=180)

        # Update icons
        calm_gif = os.path.join(char_dir, "calm.gif")
        if os.path.exists(calm_gif):
            im = Image.open(calm_gif)
            first_frame = im.convert('RGBA')
            first_frame.resize((64, 64), Image.Resampling.LANCZOS).save(os.path.join(icons_dir, f"{char}.png"))
            first_frame.resize((64, 64), Image.Resampling.LANCZOS).save(os.path.join(icons_dir, f"{char}.ico"), format='ICO')
            print(f"[OK] Updated icon for {char}")

if __name__ == "__main__":
    process_all()

import os
import shutil
import cv2
import numpy as np
from PIL import Image, ImageSequence

def remove_green_screen_from_gif(input_gif, output_gif, target_size=180):
    if not os.path.exists(input_gif):
        print(f"File not found: {input_gif}")
        return False

    im = Image.open(input_gif)
    frames = []
    durations = []

    for frame in ImageSequence.Iterator(im):
        duration = frame.info.get('duration', 80)
        durations.append(duration)

        # Convert PIL frame to RGBA numpy array
        frame_rgb = frame.convert('RGB')
        arr = np.array(frame_rgb)
        h, w = arr.shape[:2]

        # Resize to sharp crisp pixel size
        resized = cv2.resize(arr, (target_size, target_size), interpolation=cv2.INTER_AREA)

        # Convert to HSV for accurate chroma keying
        hsv = cv2.cvtColor(resized, cv2.COLOR_RGB2HSV)
        
        # Green Hue range in OpenCV is ~35 to 85 (out of 180)
        lower_green = np.array([35, 70, 70])
        upper_green = np.array([85, 255, 255])
        
        green_mask = cv2.inRange(hsv, lower_green, upper_green)

        # Create RGBA
        rgba = cv2.cvtColor(resized, cv2.COLOR_RGB2RGBA)
        
        # Make green pixels 100% transparent
        rgba[green_mask > 0, 3] = 0

        # Gentle green spill suppression on border pixels
        r = rgba[:, :, 0].astype(np.float32)
        g = rgba[:, :, 1].astype(np.float32)
        b = rgba[:, :, 2].astype(np.float32)
        spill_mask = (g > r + 30) & (g > b + 30) & (rgba[:, :, 3] > 0)
        rgba[spill_mask, 1] = np.clip((r[spill_mask] + b[spill_mask]) / 2, 0, 255).astype(np.uint8)

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
        print(f"[OK] Converted {os.path.basename(output_gif)} ({len(frames)} frames)")
        return True
    return False

def process_character(char_name, base_dir=r"g:\My Drive\04_Desarrollo_AI\Spark_Desktop\assets"):
    char_dir = os.path.join(base_dir, char_name)
    if not os.path.exists(char_dir):
        print(f"Directory not found: {char_dir}")
        return

    raw_dir = os.path.join(char_dir, "raw_green")
    os.makedirs(raw_dir, exist_ok=True)

    states = ["calm", "working", "waiting", "done", "error"]
    for state in states:
        src = os.path.join(char_dir, f"{state}.gif")
        backup = os.path.join(raw_dir, f"{state}.gif")
        if os.path.exists(src):
            if not os.path.exists(backup):
                shutil.copyfile(src, backup)
            remove_green_screen_from_gif(backup, src, target_size=180)

    # Generate Tray & Window Icons
    icons_dir = os.path.join(base_dir, "icons")
    os.makedirs(icons_dir, exist_ok=True)

    calm_gif = os.path.join(char_dir, "calm.gif")
    if os.path.exists(calm_gif):
        im = Image.open(calm_gif)
        first_frame = im.convert('RGBA')
        png_icon = os.path.join(icons_dir, f"{char_name}.png")
        ico_icon = os.path.join(icons_dir, f"{char_name}.ico")
        first_frame.resize((64, 64), Image.Resampling.LANCZOS).save(png_icon)
        first_frame.resize((64, 64), Image.Resampling.LANCZOS).save(ico_icon, format='ICO')
        print(f"[OK] Generated Tray Icon: {png_icon}")

def main():
    for char in ["llama", "kitty", "piper"]:
        print(f"\n================ Processing {char.upper()} ================")
        process_character(char)

if __name__ == "__main__":
    main()

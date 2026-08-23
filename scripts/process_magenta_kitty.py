import os
import shutil
import cv2
import numpy as np
from PIL import Image, ImageSequence

def remove_magenta_from_gif(input_gif, output_gif, target_size=180):
    if not os.path.exists(input_gif):
        return False

    im = Image.open(input_gif)
    frames = []
    durations = []

    for frame in ImageSequence.Iterator(im):
        durations.append(frame.info.get('duration', 80))
        arr = np.array(frame.convert('RGB'))
        
        # Resize to sharp pixel art size
        resized = cv2.resize(arr, (target_size, target_size), interpolation=cv2.INTER_AREA)
        
        # Convert to HSV for accurate magenta isolation
        hsv = cv2.cvtColor(resized, cv2.COLOR_RGB2HSV)
        
        # Magenta Hue range in OpenCV HSV: ~135 to 175
        lower_magenta = np.array([135, 50, 50])
        upper_magenta = np.array([175, 255, 255])
        mask = cv2.inRange(hsv, lower_magenta, upper_magenta)
        
        rgba = cv2.cvtColor(resized, cv2.COLOR_RGB2RGBA)
        rgba[mask > 0, 3] = 0
        
        # Edge despill: suppress any magenta fringe on borders
        r = rgba[:, :, 0].astype(np.float32)
        g = rgba[:, :, 1].astype(np.float32)
        b = rgba[:, :, 2].astype(np.float32)
        spill = (r > g + 40) & (b > g + 40) & (rgba[:, :, 3] > 0)
        rgba[spill, 0] = np.clip((g[spill] + b[spill]) / 2, 0, 255).astype(np.uint8)
        rgba[spill, 2] = np.clip((g[spill] + r[spill]) / 2, 0, 255).astype(np.uint8)
        
        frames.append(Image.fromarray(rgba))

    if frames:
        avg_dur = int(np.mean(durations)) if durations else 80
        frames[0].save(
            output_gif,
            save_all=True,
            append_images=frames[1:],
            loop=0,
            duration=avg_dur,
            disposal=2,
            transparency=0
        )
        print(f"[OK] Processed magenta -> transparent: {os.path.basename(output_gif)} ({len(frames)} frames)")
        return True
    return False

def main():
    kitty_dir = r"g:\My Drive\04_Desarrollo_AI\Spark_Desktop\assets\kitty"
    raw_dir = os.path.join(kitty_dir, "raw_magenta")
    os.makedirs(raw_dir, exist_ok=True)
    
    states = ["calm", "working", "waiting", "done", "error"]
    for state in states:
        src = os.path.join(kitty_dir, f"{state}.gif")
        backup = os.path.join(raw_dir, f"{state}.gif")
        
        if os.path.exists(src):
            if not os.path.exists(backup) or os.path.getsize(src) > 500000:
                shutil.copyfile(src, backup)
            remove_magenta_from_gif(backup, src, target_size=180)

    # Update Kitty icon in assets/icons
    icons_dir = r"g:\My Drive\04_Desarrollo_AI\Spark_Desktop\assets\icons"
    os.makedirs(icons_dir, exist_ok=True)
    
    calm_gif = os.path.join(kitty_dir, "calm.gif")
    if os.path.exists(calm_gif):
        im = Image.open(calm_gif)
        first_frame = im.convert('RGBA')
        png_icon = os.path.join(icons_dir, "kitty.png")
        ico_icon = os.path.join(icons_dir, "kitty.ico")
        first_frame.resize((64, 64), Image.Resampling.LANCZOS).save(png_icon)
        first_frame.resize((64, 64), Image.Resampling.LANCZOS).save(ico_icon, format='ICO')
        first_frame.save(os.path.join(kitty_dir, "transparent_sample.png"))
        print("[OK] Updated Kitty icons and transparent_sample.png")

if __name__ == "__main__":
    main()

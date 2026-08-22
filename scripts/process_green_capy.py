import os
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
        # If any remaining pixel has excessive green compared to R and B
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
        print(f"[OK] Processed green screen -> transparent: {os.path.basename(output_gif)} ({len(frames)} frames)")
        return True
    return False

def main():
    capy_dir = r"g:\My Drive\04_Desarrollo_AI\Spark_Desktop\assets\capy"
    
    # Save a backup of old raw green gifs
    raw_dir = os.path.join(capy_dir, "raw_green")
    os.makedirs(raw_dir, exist_ok=True)
    
    for state in ["calm", "working", "waiting", "done", "error"]:
        src = os.path.join(capy_dir, f"{state}.gif")
        backup = os.path.join(raw_dir, f"{state}.gif")
        
        if os.path.exists(src):
            if not os.path.exists(backup):
                import shutil
                shutil.copyfile(src, backup)
            
            remove_green_screen_from_gif(backup, src, target_size=180)

    # Save a composite preview image on dark and light checkered background
    sample_gif = os.path.join(capy_dir, "calm.gif")
    if os.path.exists(sample_gif):
        im = Image.open(sample_gif)
        first_frame = im.convert('RGBA')
        first_frame.save(os.path.join(capy_dir, "transparent_sample.png"))
        print("[OK] Saved transparent preview to transparent_sample.png")

if __name__ == "__main__":
    main()

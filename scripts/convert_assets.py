import os
import cv2
import numpy as np
from PIL import Image

def convert_mp4_to_transparent_gif(mp4_path, gif_path, target_size=160, max_frames=50, threshold=22):
    if not os.path.exists(mp4_path):
        print(f"File not found: {mp4_path}")
        return False
    
    cap = cv2.VideoCapture(mp4_path)
    frames = []
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    step = 2 if fps > 30 else 1
    duration = int(1000 / (fps / step))
    
    count = 0
    while True:
        ret, frame = cap.read()
        if not ret or len(frames) >= max_frames:
            break
        count += 1
        if count % step != 0:
            continue
            
        h, w, _ = frame.shape
        crop_size = min(h, w)
        sx = (w - crop_size) // 2
        sy = (h - crop_size) // 2
        cropped = frame[sy:sy+crop_size, sx:sx+crop_size]
        
        resized = cv2.resize(cropped, (target_size, target_size), interpolation=cv2.INTER_AREA)
        rgba = cv2.cvtColor(resized, cv2.COLOR_BGR2RGBA)
        
        # Outer boundary flood fill on the frame for perfect clean edges
        mask = (rgba[:, :, 0] < threshold) & (rgba[:, :, 1] < threshold) & (rgba[:, :, 2] < threshold)
        
        # Simple & fast boundary connectivity
        h_r, w_r = resized.shape[:2]
        bg_mask = np.zeros((h_r + 2, w_r + 2), np.uint8)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        
        # Flood fill from 4 corners
        cv2.floodFill(gray, bg_mask, (0, 0), 0, loDiff=threshold, upDiff=threshold)
        cv2.floodFill(gray, bg_mask, (w_r - 1, 0), 0, loDiff=threshold, upDiff=threshold)
        cv2.floodFill(gray, bg_mask, (0, h_r - 1), 0, loDiff=threshold, upDiff=threshold)
        cv2.floodFill(gray, bg_mask, (w_r - 1, h_r - 1), 0, loDiff=threshold, upDiff=threshold)
        
        # Set alpha to 0 for flood-filled outer background
        is_bg = bg_mask[1:-1, 1:-1] == 1
        rgba[is_bg, 3] = 0
        
        frames.append(Image.fromarray(rgba))
        
    cap.release()
    if frames:
        frames[0].save(gif_path, save_all=True, append_images=frames[1:], loop=0, duration=duration, disposal=2)
        print(f"[OK] Converted: {os.path.basename(mp4_path)} -> {os.path.basename(gif_path)} ({len(frames)} frames)")
        return True
    return False

def main():
    base_dir = r"g:\My Drive\04_Desarrollo_AI\Spark_Desktop\assets"
    
    # 1. Convert Capy
    capy_dir = os.path.join(base_dir, "capy")
    if os.path.exists(capy_dir):
        for state in ["calm", "working", "waiting", "done", "error"]:
            mp4 = os.path.join(capy_dir, f"{state}.mp4")
            gif = os.path.join(capy_dir, f"{state}.gif")
            convert_mp4_to_transparent_gif(mp4, gif, target_size=150, max_frames=45, threshold=20)

    # 2. Convert Dr. Octopus
    dr_dir = os.path.join(base_dir, "dr_octopus")
    for state in ["calm", "working", "waiting", "done", "error"]:
        mp4 = os.path.join(dr_dir, f"{state}.mp4")
        gif = os.path.join(dr_dir, f"{state}.gif")
        convert_mp4_to_transparent_gif(mp4, gif, target_size=150, max_frames=45, threshold=20)
        
    # 2. Convert Astro
    astro_dir = os.path.join(base_dir, "astro")
    astro_map = {
        "calm": "Astro_8bit_calm.mp4",
        "working": "Astro_8bit_working.mp4",
        "waiting": "Astro_connecting.mp4",
        "done": "Astro_done.mp4",
        "error": "Astro_8bit_error.mp4"
    }
    for state, filename in astro_map.items():
        mp4 = os.path.join(astro_dir, filename)
        gif = os.path.join(astro_dir, f"{state}.gif")
        convert_mp4_to_transparent_gif(mp4, gif, target_size=150, max_frames=45, threshold=25)

if __name__ == "__main__":
    main()

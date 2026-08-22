import os
import cv2
import numpy as np
from PIL import Image

def detect_chroma_type(corner_pixels):
    """
    Detects if the background is Green Screen (#00FF00), Magenta (#FF00FF), or Black (#000000)
    based on corner pixel samples (RGB).
    """
    avg_r = np.mean([p[0] for p in corner_pixels])
    avg_g = np.mean([p[1] for p in corner_pixels])
    avg_b = np.mean([p[2] for p in corner_pixels])

    # Green screen check (Green dominant)
    if avg_g > 100 and avg_g > (avg_r + 30) and avg_g > (avg_b + 30):
        return 'green'
    # Magenta / Fuchsia screen check (Red and Blue dominant, Green very low)
    elif avg_r > 100 and avg_b > 100 and avg_g < 60:
        return 'magenta'
    # Default: Black / Dark background
    else:
        return 'black'

def convert_mp4_to_transparent_gif(mp4_path, gif_path, target_size=150, max_frames=45):
    if not os.path.exists(mp4_path):
        print(f"File not found: {mp4_path}")
        return False

    cap = cv2.VideoCapture(mp4_path)
    frames = []
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    step = 2 if fps > 30 else 1
    duration = int(1000 / (fps / step))

    count = 0
    chroma_type = None

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
        rgb = rgba[:, :, :3]

        # Determine chroma key color once from first frame
        if chroma_type is None:
            corners = [rgb[0, 0], rgb[0, -1], rgb[-1, 0], rgb[-1, -1]]
            chroma_type = detect_chroma_type(corners)
            print(f"Detected background type for {os.path.basename(mp4_path)}: {chroma_type.upper()}")

        if chroma_type == 'green':
            # Ultra clean HSV Green Keying (Hue 35 to 85)
            hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
            lower_green = np.array([35, 60, 60])
            upper_green = np.array([85, 255, 255])
            mask = cv2.inRange(hsv, lower_green, upper_green)
            rgba[mask > 0, 3] = 0

        elif chroma_type == 'magenta':
            # Clean Magenta Keying
            hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
            lower_magenta = np.array([140, 60, 60])
            upper_magenta = np.array([175, 255, 255])
            mask = cv2.inRange(hsv, lower_magenta, upper_magenta)
            rgba[mask > 0, 3] = 0

        else:
            # Black background: Flood-fill from outer corners only
            threshold = 22
            h_r, w_r = resized.shape[:2]
            bg_mask = np.zeros((h_r + 2, w_r + 2), np.uint8)
            gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

            cv2.floodFill(gray, bg_mask, (0, 0), 0, loDiff=threshold, upDiff=threshold)
            cv2.floodFill(gray, bg_mask, (w_r - 1, 0), 0, loDiff=threshold, upDiff=threshold)
            cv2.floodFill(gray, bg_mask, (0, h_r - 1), 0, loDiff=threshold, upDiff=threshold)
            cv2.floodFill(gray, bg_mask, (w_r - 1, h_r - 1), 0, loDiff=threshold, upDiff=threshold)

            is_bg = bg_mask[1:-1, 1:-1] == 1
            rgba[is_bg, 3] = 0

        frames.append(Image.fromarray(rgba))

    cap.release()
    if frames:
        frames[0].save(gif_path, save_all=True, append_images=frames[1:], loop=0, duration=duration, disposal=2)
        print(f"[OK] Converted: {os.path.basename(mp4_path)} -> {os.path.basename(gif_path)} ({len(frames)} frames)")
        return True
    return False

def convert_all_characters(base_dir=r"g:\My Drive\04_Desarrollo_AI\Spark_Desktop\assets"):
    if not os.path.exists(base_dir):
        return

    for item in os.listdir(base_dir):
        char_dir = os.path.join(base_dir, item)
        if os.path.isdir(char_dir) and item != "gifs":
            for state in ["calm", "working", "waiting", "done", "error"]:
                mp4 = os.path.join(char_dir, f"{state}.mp4")
                gif = os.path.join(char_dir, f"{state}.gif")
                if os.path.exists(mp4):
                    convert_mp4_to_transparent_gif(mp4, gif, target_size=150, max_frames=45)

def main():
    convert_all_characters()

if __name__ == "__main__":
    main()

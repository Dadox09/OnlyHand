import cv2
import numpy as np
import mediapipe as mp
import myLibraries

BaseOptions = mp.tasks.BaseOptions
FaceDetector = mp.tasks.vision.FaceDetector
FaceDetectorOptions = mp.tasks.vision.FaceDetectorOptions
VisionRunningMode = mp.tasks.vision.RunningMode

latest_result = None

def save_result(result, _output_image, _timestamp_ms):
    global latest_result
    latest_result = result

options = FaceDetectorOptions(
    base_options=BaseOptions(model_asset_path='models/face/blaze_face_short_range.tflite'),
    running_mode=VisionRunningMode.LIVE_STREAM,
    result_callback=save_result)

vc = cv2.VideoCapture(0)
timestamp = 0

with FaceDetector.create_from_options(options) as face:
    while True:
        rval, frame = vc.read()
        if not rval:
            break

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        face.detect_async(mp_image, timestamp)
        timestamp += 1

        if latest_result:
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            annotated = myLibraries.visualizeFaces(frame_rgb, latest_result)
            frame = cv2.cvtColor(annotated, cv2.COLOR_RGB2BGR)

        cv2.imshow("preview", frame)

        if cv2.waitKey(20) == 27:  # ESC
            break

vc.release()
cv2.destroyAllWindows()

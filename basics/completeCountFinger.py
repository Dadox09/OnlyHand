import myLibraries
import cv2
import mediapipe as mp


BaseOptions = mp.tasks.BaseOptions
HandLandmarker = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
HandLandmarkerResult = mp.tasks.vision.HandLandmarkerResult
VisionRunningMode = mp.tasks.vision.RunningMode

latest_result = None

def save_result(result: HandLandmarkerResult, _output_image: mp.Image, _timestamp_ms: int):
    global latest_result
    latest_result = result

options = HandLandmarkerOptions(
    base_options=BaseOptions(model_asset_path='models/hand/hand_landmarker.task'),
    running_mode=VisionRunningMode.LIVE_STREAM,
    result_callback=save_result)

vc = cv2.VideoCapture(0)
timestamp = 0

with HandLandmarker.create_from_options(options) as landmarker:
    while True:
        rval, frame = vc.read()
        if not rval:
            break

        # convert frame for mediapipe
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        landmarker.detect_async(mp_image, timestamp)
        timestamp += 1

        # read landmarks if available
        if latest_result and latest_result.hand_landmarks:
            landmarks = latest_result.hand_landmarks[0]  # first hand

            myLibraries.showDotsOnLandmarks(frame, landmarks)

            myLibraries.binaryCountWithFingers(frame, landmarks)

        cv2.imshow("preview", frame)

        if cv2.waitKey(20) == 27:  # ESC
            break

vc.release()
cv2.destroyAllWindows()



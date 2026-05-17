import cv2
import numpy as np
import mediapipe as mp
import myLibraries

BaseOptions = mp.tasks.BaseOptions
GestureRecognizer = mp.tasks.vision.GestureRecognizer
GestureRecognizerOptions = mp.tasks.vision.GestureRecognizerOptions
GestureRecognizerResult = mp.tasks.vision.GestureRecognizerResult
VisionRunningMode = mp.tasks.vision.RunningMode

latest_result = None

def save_result(result, _output_image, _timestamp_ms):
    global latest_result
    latest_result = result

options = GestureRecognizerOptions(
    base_options=BaseOptions(model_asset_path='models/hand/gesture_recognizer.task'),
    running_mode=VisionRunningMode.LIVE_STREAM,
    result_callback=save_result,
    num_hands=2,
    )

vc = cv2.VideoCapture(0)
timestamp = 0

with GestureRecognizer.create_from_options(options) as gesture:
    while True:
        rval, frame = vc.read()
        if not rval:
            break

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        gesture.recognize_async(mp_image, timestamp)
        timestamp += 1

        if latest_result and latest_result.gestures:
            for i, hand_gestures in enumerate(latest_result.gestures):
                gesture_name = hand_gestures[0].category_name
                score = round(hand_gestures[0].score, 2)
                cv2.putText(frame, f"{gesture_name} ({score})", (30, 50 + i * 50),
                            cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 0), 3)

        cv2.imshow("preview", frame)

        if cv2.waitKey(20) == 27:  # ESC
            break

vc.release()
cv2.destroyAllWindows()

import cv2
import numpy as np
import mediapipe 
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import myLibraries

img = cv2.imread('images/dog.webp')

base_options = python.BaseOptions(model_asset_path='models/object/efficientdet.tflite')
options = vision.ObjectDetectorOptions(base_options=base_options,
                                       score_threshold=0.5)
detector = vision.ObjectDetector.create_from_options(options)

img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
image = mediapipe.Image(image_format=mediapipe.ImageFormat.SRGB, data=img_rgb)

detection_result = detector.detect(image)

image_copy = np.copy(image.numpy_view())
annotated_image = myLibraries.visualize(image_copy, detection_result)
bgr_annotated_image = cv2.cvtColor(annotated_image, cv2.COLOR_RGB2BGR)
cv2.imshow("Result", bgr_annotated_image)

cv2.waitKey(0)
cv2.destroyAllWindows()
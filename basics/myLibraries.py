import cv2

def showDotsOnLandmarks(frame, landmarks):
    for landmark in landmarks:
        frame_width, frame_height = frame.shape[1], frame.shape[0]

        px = int(landmark.x * frame_width)
        py = int(landmark.y * frame_height) 

        cv2.circle(frame, (px, py), 5, (0, 255, 0), -1)



def binaryCountWithFingers(frame, landmarks):
    index_tip = landmarks[8].y          #indice
    index_base = landmarks[6].y
    middle_tip = landmarks[12].y        #medio
    middle_base = landmarks[10].y
    ring_tip = landmarks[16].y          #anulare
    ring_base = landmarks[14].y
    pinky_tip = landmarks[20].y         #mignolo
    pinky_base = landmarks[18].y

    two_power_zero = 1 if index_tip < index_base else 0
    two_power_one = 2 if middle_tip < middle_base else 0
    two_power_two = 4 if ring_tip < ring_base else 0 
    two_power_three = 8 if pinky_tip < pinky_base else 0

    count = two_power_zero + two_power_one +  two_power_two +  two_power_three 
    

    cv2.putText(frame, f"Count: {count}", (30, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 255, 0), 3)
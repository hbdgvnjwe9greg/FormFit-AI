import os
import cv2
import joblib
import numpy as np
import pandas as pd
import warnings
import pyttsx3
import threading
import time
from datetime import datetime
from collections import deque
from ultralytics import YOLO

from django.http import StreamingHttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth.hashers import make_password, check_password

from pymongo import MongoClient

warnings.filterwarnings('ignore')

# -------------------------------------------------------------
# 1. MongoDB Connection
# -------------------------------------------------------------
mongo_client = MongoClient("mongodb://127.0.0.1:27017/")
mongo_db = mongo_client["formfit_ai"]
users_collection = mongo_db["users"]
workout_collection = mongo_db["workout_sessions"]

# -------------------------------------------------------------
# 2. Urdu Voice Alert & State Controller
# -------------------------------------------------------------
is_stream_active = False
is_voice_enabled = True

active_session_data = {
    "exercise": "",
    "rep_count": 0,
    "form_evaluations": []
}

last_spoken_time = 0
SPEECH_COOLDOWN = 3.5
speech_lock = threading.Lock()

# Expanded Urdu Numbers Mapping (1 to 30)
URDU_NUMBERS = {
    1: "Ek", 2: "Do", 3: "Teen", 4: "Chaar", 5: "Paanch",
    6: "Chhay", 7: "Saat", 8: "Aath", 9: "Nou", 10: "Das",
    11: "Gyaarah", 12: "Baarah", 13: "Teerah", 14: "Chaudah", 15: "Pandraah",
    16: "Solaah", 17: "Sattraah", 18: "Athaaraah", 19: "Unnees", 20: "Bees",
    21: "Ikkees", 22: "Baayees", 23: "Tayees", 24: "Chaubees", 25: "Pachees",
    26: "Chhabbees", 27: "Sattaayees", 28: "Atthaayees", 29: "Untees", 30: "Tees"
}

def speak_alert_urdu(text):
    """Executes voice alert ONLY when streaming and voice toggle are active."""
    def run():
        global is_stream_active, is_voice_enabled
        if not is_stream_active or not is_voice_enabled:
            return
        if not speech_lock.acquire(blocking=False):
            return
        try:
            local_engine = pyttsx3.init()
            local_engine.setProperty('rate', 130)  # Slower pace for clearer Urdu accent
            local_engine.setProperty('volume', 1.0)
            local_engine.say(text)
            local_engine.runAndWait()
            local_engine.stop()
        except Exception:
            pass
        finally:
            if speech_lock.locked():
                speech_lock.release()

    threading.Thread(target=run, daemon=True).start()

# -------------------------------------------------------------
# 3. Load AI Models & Feature Setup
# -------------------------------------------------------------
print("Loading AI Models into Django Memory...")
model_ex = joblib.load('exercise_classifier.pkl')
model_form = joblib.load('posture_evaluator.pkl')
yolo_pose = YOLO('yolov8n-pose.pt')

SKELETON_CONNECTIONS = [
    (5, 7), (7, 9), (6, 8), (8, 10), (5, 6),
    (5, 11), (6, 12), (11, 12), (11, 13), (13, 15), (12, 14), (14, 16)
]

FEATURE_COLS = []
for i in range(17):
    FEATURE_COLS.extend([f'x_{i}', f'y_{i}', f'conf_{i}'])
FEATURE_COLS.extend([
    'left_elbow', 'right_elbow', 'left_shoulder', 'right_shoulder',
    'left_hip', 'right_hip', 'left_knee', 'right_knee'
])

def calculate_angle(a, b, c):
    a, b, c = np.array(a), np.array(b), np.array(c)
    ba = a - b
    bc = c - b
    cosine_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6)
    angle = np.arccos(np.clip(cosine_angle, -1.0, 1.0))
    return np.degrees(angle)

def normalize_keypoints(kpts):
    norm_kpts = np.copy(kpts)
    hip_center = (kpts[11] + kpts[12]) / 2.0
    shoulder_center = (kpts[5] + kpts[6]) / 2.0
    torso_size = np.linalg.norm(shoulder_center - hip_center) + 1e-6
    
    norm_kpts[:, 0] = (kpts[:, 0] - hip_center[0]) / torso_size
    norm_kpts[:, 1] = (kpts[:, 1] - hip_center[1]) / torso_size
    return norm_kpts

# -------------------------------------------------------------
# 4. Authentication Endpoints
# -------------------------------------------------------------
@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    username = request.data.get('username', '').strip()
    email = request.data.get('email', '').strip().lower()
    password = request.data.get('password', '').strip()

    if not username or not email or not password:
        return Response({'error': 'Please fill in all fields.'}, status=status.HTTP_400_BAD_REQUEST)

    if users_collection.find_one({'username': username}):
        return Response({'error': 'Username is already taken.'}, status=status.HTTP_400_BAD_REQUEST)

    if users_collection.find_one({'email': email}):
        return Response({'error': 'Email is already registered.'}, status=status.HTTP_400_BAD_REQUEST)

    hashed_password = make_password(password)
    user_doc = {
        'username': username,
        'email': email,
        'password': hashed_password,
        'created_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    
    result = users_collection.insert_one(user_doc)
    return Response({
        'status': 'success',
        'message': 'User registered successfully in MongoDB!',
        'user': {'id': str(result.inserted_id), 'username': username, 'email': email}
    }, status=status.HTTP_201_CREATED)

@api_view(['POST'])
@permission_classes([AllowAny])
def login_user(request):
    login_identifier = request.data.get('username', '').strip()
    password = request.data.get('password', '').strip()

    if not login_identifier or not password:
        return Response({'error': 'Username/Email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

    user = users_collection.find_one({
        '$or': [{'username': login_identifier}, {'email': login_identifier.lower()}]
    })

    if not user or not check_password(password, user['password']):
        return Response({'error': 'Invalid username or password.'}, status=status.HTTP_401_UNAUTHORIZED)

    return Response({
        'status': 'success',
        'user': {'id': str(user['_id']), 'username': user['username'], 'email': user['email']}
    }, status=status.HTTP_200_OK)

# -------------------------------------------------------------
# 5. Pre-recorded Video Analysis Endpoint
# -------------------------------------------------------------
@api_view(['POST'])
@permission_classes([AllowAny])
def analyze_video(request):
    if 'file' not in request.FILES:
        return Response({"status": "error", "message": "No video file provided"}, status=status.HTTP_400_BAD_REQUEST)

    video_file = request.FILES['file']
    temp_video_path = f"temp_{video_file.name}"

    try:
        with open(temp_video_path, 'wb+') as destination:
            for chunk in video_file.chunks():
                destination.write(chunk)

        cap = cv2.VideoCapture(temp_video_path)
        rep_count = 0
        stage = None
        detected_exercises = []
        form_evaluations = []

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            results = yolo_pose(frame, verbose=False)

            for r in results:
                if r.keypoints is not None and len(r.keypoints) > 0:
                    kpts = r.keypoints.xy[0].cpu().numpy()
                    confs = r.keypoints.conf[0].cpu().numpy() if r.keypoints.conf is not None else np.ones(17)

                    if len(kpts) < 17 or np.mean(confs) < 0.3:
                        continue

                    norm_kpts = normalize_keypoints(kpts)

                    feature_row = []
                    for i in range(17):
                        feature_row.extend([norm_kpts[i][0], norm_kpts[i][1], confs[i]])

                    l_sh, r_sh = kpts[5], kpts[6]
                    l_el, r_el = kpts[7], kpts[8]
                    l_wr, r_wr = kpts[9], kpts[10]
                    l_hp, r_hp = kpts[11], kpts[12]
                    l_kn, r_kn = kpts[13], kpts[14]
                    l_ak, r_ak = kpts[15], kpts[16]

                    left_elbow = calculate_angle(l_sh, l_el, l_wr)
                    right_elbow = calculate_angle(r_sh, r_el, r_wr)
                    left_shoulder = calculate_angle(l_hp, l_sh, l_el)
                    right_shoulder = calculate_angle(r_hp, r_sh, r_el)
                    left_hip = calculate_angle(l_sh, l_hp, l_kn)
                    right_hip = calculate_angle(r_sh, r_hp, r_kn)
                    left_knee = calculate_angle(l_hp, l_kn, l_ak)
                    right_knee = calculate_angle(r_hp, r_sh, r_ak)

                    feature_row.extend([left_elbow, right_elbow, left_shoulder, right_shoulder,
                                        left_hip, right_hip, left_knee, right_knee])

                    X_input = pd.DataFrame([feature_row], columns=FEATURE_COLS)

                    pred_ex = model_ex.predict(X_input)[0]
                    pred_fm = model_form.predict(X_input)[0]

                    detected_exercises.append(pred_ex)
                    form_evaluations.append(pred_fm)

                    if pred_fm == 'good':
                        primary_angle = left_knee if pred_ex == 'squat' else left_elbow
                        if primary_angle > 150:
                            stage = "down" if pred_ex == 'bicep_curl' else "up"
                        elif primary_angle < 70 and stage in ["down", "up"]:
                            stage = "up" if pred_ex == 'bicep_curl' else "down"
                            rep_count += 1

        cap.release()

        most_common_exercise = max(set(detected_exercises), key=detected_exercises.count) if detected_exercises else "Unknown"
        good_form_pct = (form_evaluations.count('good') / len(form_evaluations) * 100) if form_evaluations else 0.0

        return Response({
            "status": "success",
            "exercise": most_common_exercise,
            "total_repetitions": rep_count,
            "posture_accuracy_score": f"{good_form_pct:.1f}%",
            "form_summary": "Good Form overall" if good_form_pct >= 70 else "Needs Form Correction"
        })

    except Exception as e:
        return Response({"status": "error", "message": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    finally:
        if os.path.exists(temp_video_path):
            try:
                os.remove(temp_video_path)
            except Exception:
                pass

# -------------------------------------------------------------
# 6. MongoDB History Retrieval Endpoint
# -------------------------------------------------------------
@api_view(['GET'])
@permission_classes([AllowAny])
def get_workout_history(request):
    try:
        sessions = list(workout_collection.find().sort("_id", -1).limit(20))
        data = []
        for idx, s in enumerate(sessions, 1):
            exercise_val = s.get("exercise") or s.get("exercise_name") or "BICEP CURL"
            reps_val = s.get("repetition_count", s.get("total_reps", 0))
            score_val = s.get("posture_score", "0%")
            if isinstance(score_val, (int, float)):
                score_val = f"{score_val}%"
            assessment_val = s.get("form_assessment", s.get("summary", "Good Form overall"))

            data.append({
                "id": idx,
                "exercise": str(exercise_val).upper(),
                "repetition_count": reps_val,
                "posture_score": str(score_val),
                "form_assessment": str(assessment_val),
                "date": s.get("timestamp", s.get("created_at", datetime.now().strftime("%Y-%m-%d %H:%M")))
            })
        return Response({"status": "success", "history": data})
    except Exception as e:
        return Response({"status": "error", "message": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# -------------------------------------------------------------
# 7. Voice Alert Toggle Endpoint (Triggered by React UI)
# -------------------------------------------------------------
@api_view(['POST'])
@permission_classes([AllowAny])
def toggle_voice(request):
    global is_voice_enabled
    active_state = request.data.get("active", True)
    is_voice_enabled = bool(active_state)
    return Response({
        "status": "success",
        "voice_active": is_voice_enabled,
        "message": "Urdu voice alerts enabled" if is_voice_enabled else "Urdu voice alerts muted"
    })

# -------------------------------------------------------------
# 8. STOP SESSION ENDPOINT (Flushes Session & Mutes Engine)
# -------------------------------------------------------------
@api_view(['POST'])
@permission_classes([AllowAny])
def stop_session(request):
    global is_stream_active, active_session_data, is_voice_enabled
    is_stream_active = False
    is_voice_enabled = False  # Ensure TTS is completely stopped when session ends

    if active_session_data["rep_count"] > 0:
        evals = active_session_data["form_evaluations"]
        avg_posture = (evals.count('good') / len(evals) * 100) if evals else 0.0
        summary_text = "Good Form overall" if avg_posture >= 70 else "Needs Form Correction"
        
        session_doc = {
            "exercise": active_session_data["exercise"].replace('_', ' ').upper(),
            "exercise_name": active_session_data["exercise"].replace('_', ' ').upper(),
            "repetition_count": active_session_data["rep_count"],
            "total_reps": active_session_data["rep_count"],
            "posture_score": f"{round(avg_posture, 1)}%",
            "form_assessment": summary_text,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        workout_collection.insert_one(session_doc)
        active_session_data = {"exercise": "", "rep_count": 0, "form_evaluations": []}
        return Response({"status": "success", "message": "Session stopped and saved to MongoDB!"})

    return Response({"status": "success", "message": "Session stopped."})

# -------------------------------------------------------------
# 9. Real-Time Stream Generator
# -------------------------------------------------------------
def gen_frames(selected_mode='bicep_curl'):
    global last_spoken_time, is_stream_active, active_session_data, is_voice_enabled
    
    is_stream_active = True
    active_session_data = {
        "exercise": selected_mode,
        "rep_count": 0,
        "form_evaluations": []
    }

    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    rep_count = 0
    stage = None
    form_evaluations = []
    angle_buffer = deque(maxlen=5)

    mode_urdu_names = {
        'bicep_curl': "Bicep Curls",
        'triceps_extension': "Triceps Extension",
        'squat': "Squats",
        'shoulder_press': "Shoulder Press",
        'back_exercise': "Back Exercise"
    }
    
    if is_voice_enabled:
        speak_alert_urdu(f"{mode_urdu_names.get(selected_mode, 'Exercise')} mode select ho gaya hai")

    while cap.isOpened() and is_stream_active:
        ret, frame = cap.read()
        if not ret:
            break

        results = yolo_pose(frame, verbose=False)
        person_detected = False

        for r in results:
            if not is_stream_active:
                break

            if r.keypoints is not None and len(r.keypoints) > 0:
                kpts = r.keypoints.xy[0].cpu().numpy()
                confs = r.keypoints.conf[0].cpu().numpy() if r.keypoints.conf is not None else np.ones(17)

                valid_indices = [i for i in range(len(kpts)) if confs[i] > 0.35]
                if len(kpts) < 17 or len(valid_indices) < 6:
                    continue

                person_detected = True
                norm_kpts = normalize_keypoints(kpts)

                valid_kpts = kpts[valid_indices]
                min_x, min_y = np.min(valid_kpts[:, 0]), np.min(valid_kpts[:, 1])
                max_x, max_y = np.max(valid_kpts[:, 0]), np.max(valid_kpts[:, 1])
                
                h_img, w_img, _ = frame.shape
                bbox_x1 = max(0, int(min_x - 20))
                bbox_y1 = max(0, int(min_y - 30))
                bbox_x2 = min(w_img, int(max_x + 20))
                bbox_y2 = min(h_img, int(max_y + 20))

                for start, end in SKELETON_CONNECTIONS:
                    if confs[start] > 0.3 and confs[end] > 0.3:
                        pt1 = (int(kpts[start][0]), int(kpts[start][1]))
                        pt2 = (int(kpts[end][0]), int(kpts[end][1]))
                        cv2.line(frame, pt1, pt2, (255, 255, 0), 2)

                for i in range(17):
                    if confs[i] > 0.3:
                        cv2.circle(frame, (int(kpts[i][0]), int(kpts[i][1])), 5, (0, 255, 0), -1)

                l_sh, r_sh = kpts[5], kpts[6]
                l_el, r_el = kpts[7], kpts[8]
                l_wr, r_wr = kpts[9], kpts[10]
                l_hp, r_hp = kpts[11], kpts[12]
                l_kn, r_kn = kpts[13], kpts[14]
                l_ak, r_ak = kpts[15], kpts[16]

                left_elbow = calculate_angle(l_sh, l_el, l_wr)
                right_elbow = calculate_angle(r_sh, r_el, r_wr)
                left_shoulder = calculate_angle(l_hp, l_sh, l_el)
                right_shoulder = calculate_angle(r_hp, r_sh, r_el)
                left_hip = calculate_angle(l_sh, l_hp, l_kn)
                right_hip = calculate_angle(r_sh, r_hp, r_kn)
                left_knee = calculate_angle(l_hp, l_kn, l_ak)
                right_knee = calculate_angle(r_hp, r_sh, r_ak)

                feature_row = []
                for i in range(17):
                    feature_row.extend([norm_kpts[i][0], norm_kpts[i][1], confs[i]])
                feature_row.extend([left_elbow, right_elbow, left_shoulder, right_shoulder,
                                    left_hip, right_hip, left_knee, right_knee])

                X_input = pd.DataFrame([feature_row], columns=FEATURE_COLS)
                pred_fm = model_form.predict(X_input)[0]

                if selected_mode in ['bicep_curl', 'triceps_extension']:
                    primary_angle = left_elbow
                elif selected_mode == 'shoulder_press':
                    primary_angle = left_shoulder
                elif selected_mode == 'squat':
                    primary_angle = left_knee
                else:
                    primary_angle = left_hip

                angle_buffer.append(primary_angle)
                smooth_angle = np.mean(angle_buffer)

                is_good_form = True
                urdu_warning = "Posture sahi karein"

                if selected_mode == 'bicep_curl':
                    if left_shoulder > 35:
                        is_good_form = False
                        urdu_warning = "Kohniyan jism ke sath rakhein"

                elif selected_mode == 'triceps_extension':
                    if left_shoulder < 100:
                        is_good_form = False
                        urdu_warning = "Haath sar ke pas upar rakhein"

                elif selected_mode == 'shoulder_press':
                    if left_shoulder < 40 or right_shoulder < 40:
                        is_good_form = False
                        urdu_warning = "Kohniyan baahar ki taraf rakhein"

                elif selected_mode == 'squat':
                    if left_hip < 65:
                        is_good_form = False
                        urdu_warning = "Peeth seedhi rakhein"

                elif selected_mode == 'back_exercise':
                    if left_hip > 145 or left_hip < 75:
                        is_good_form = False
                        urdu_warning = "Kamar ko 90 degree par jhukain"

                actual_posture = "GOOD POSTURE" if is_good_form else "BAD POSTURE"
                status_color = (0, 255, 0) if is_good_form else (0, 0, 255)
                form_evaluations.append("good" if is_good_form else "bad")
                active_session_data["form_evaluations"] = form_evaluations

                cv2.rectangle(frame, (bbox_x1, bbox_y1), (bbox_x2, bbox_y2), status_color, 2)
                cv2.putText(frame, f"PERSON DETECTED", (bbox_x1, bbox_y1 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, status_color, 2)

                if is_good_form:
                    if selected_mode == 'bicep_curl':
                        if smooth_angle > 150:
                            stage = "down"
                        elif smooth_angle < 60 and stage == "down":
                            stage = "up"
                            rep_count += 1
                            active_session_data["rep_count"] = rep_count
                            speak_alert_urdu(URDU_NUMBERS.get(rep_count, str(rep_count)))

                    elif selected_mode == 'triceps_extension':
                        if smooth_angle < 70:
                            stage = "flexed"
                        elif smooth_angle > 140 and stage == "flexed":
                            stage = "extended"
                            rep_count += 1
                            active_session_data["rep_count"] = rep_count
                            speak_alert_urdu(URDU_NUMBERS.get(rep_count, str(rep_count)))

                    elif selected_mode == 'shoulder_press':
                        if smooth_angle < 85:
                            stage = "down"
                        elif smooth_angle > 140 and stage == "down":
                            stage = "up"
                            rep_count += 1
                            active_session_data["rep_count"] = rep_count
                            speak_alert_urdu(URDU_NUMBERS.get(rep_count, str(rep_count)))

                    elif selected_mode == 'squat':
                        if smooth_angle > 150:
                            stage = "up"
                        elif smooth_angle < 110 and stage == "up":
                            stage = "down"
                            rep_count += 1
                            active_session_data["rep_count"] = rep_count
                            speak_alert_urdu(URDU_NUMBERS.get(rep_count, str(rep_count)))

                    elif selected_mode == 'back_exercise':
                        if smooth_angle > 145:
                            stage = "straight"
                        elif smooth_angle < 110 and stage == "straight":
                            stage = "bent"
                            rep_count += 1
                            active_session_data["rep_count"] = rep_count
                            speak_alert_urdu(URDU_NUMBERS.get(rep_count, str(rep_count)))

                current_time = time.time()
                if not is_good_form and (current_time - last_spoken_time) > SPEECH_COOLDOWN:
                    last_spoken_time = current_time
                    speak_alert_urdu(urdu_warning)

                cv2.rectangle(frame, (10, 10), (480, 170), (0, 0, 0), -1)
                cv2.putText(frame, f"Selected: {selected_mode.replace('_', ' ').upper()}", (20, 40),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
                cv2.putText(frame, f"Posture: {actual_posture}", (20, 75),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, status_color, 2)
                cv2.putText(frame, f"Reps Count: {rep_count}", (20, 115),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 0), 2)

        if not person_detected:
            cv2.rectangle(frame, (10, 10), (480, 170), (0, 0, 0), -1)
            cv2.putText(frame, f"Selected: {selected_mode.replace('_', ' ').upper()}", (20, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
            cv2.putText(frame, "Posture: NO PERSON DETECTED", (20, 75),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (128, 128, 128), 2)
            cv2.putText(frame, f"Reps Count: {rep_count}", (20, 115),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 0), 2)

        _, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

    cap.release()

def live_stream(request, mode):
    return StreamingHttpResponse(gen_frames(selected_mode=mode),
                                 content_type='multipart/x-mixed-replace; boundary=frame')
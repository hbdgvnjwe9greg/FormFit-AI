import os
import django

# Configure standalone Django environment access
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'gym_backend.settings')
django.setup()

from api.models import ExerciseSession

def save_session_to_db(exercise_name, total_reps, posture_score, dtw_score, summary):
    """Saves completed real-time workout session metrics to SQLite database."""
    try:
        session = ExerciseSession.objects.create(
            exercise_name=exercise_name,
            repetition_count=total_reps,
            posture_score=posture_score,
            dtw_accuracy_score=dtw_score,
            form_assessment=summary
        )
        print(f"\n[SUCCESS] Session saved to Database! Session ID: {session.id}")
    except Exception as e:
        print(f"\n[ERROR] Failed to save session to DB: {e}")
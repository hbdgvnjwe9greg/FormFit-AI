# Create your models here.
from django.db import models
from django.contrib.auth.models import User

class ExerciseSession(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    exercise_name = models.CharField(max_length=50)
    repetition_count = models.IntegerField(default=0)
    posture_score = models.FloatField(default=0.0)
    dtw_accuracy_score = models.FloatField(default=0.0)
    form_assessment = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.exercise_name} - Reps: {self.repetition_count} ({self.created_at.strftime('%Y-%m-%d %H:%M')})"
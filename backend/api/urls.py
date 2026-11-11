from django.urls import path
from . import views

urlpatterns = [
    path('auth/register/', views.register_user, name='register'),
    path('auth/login/', views.login_user, name='login'),
    path('history/', views.get_workout_history, name='history'),
    path('stream/<str:mode>/', views.live_stream, name='stream'),
    path('stop-stream/', views.stop_session, name='stop_session'),
    path('toggle-voice/', views.toggle_voice, name='toggle_voice'),
    path('analyze-video/', views.analyze_video, name='analyze_video'),
]
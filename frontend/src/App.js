import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Camera, StopCircle, Dumbbell, Volume2, VolumeX, 
  Activity, Award, CheckCircle2, AlertCircle, 
  User, Mail, Lock, ArrowRight, LogOut, RotateCcw 
} from 'lucide-react';

function App() {
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('username'));
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState('bicep_curl');
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('Live Stream');
  const [isUrduVoiceActive, setIsUrduVoiceActive] = useState(true);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);

  // Authentication Modal States
  const [isRegister, setIsRegister] = useState(false);
  const [authForm, setAuthForm] = useState({ username: '', email: '', password: '', confirmPassword: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const fetchHistory = async () => {
    setIsRefreshingLogs(true);
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/history/');
      if (response.data.status === 'success') {
        setHistory(response.data.history);
      }
    } catch (err) {
      console.error("Could not fetch workout history");
    } finally {
      setIsRefreshingLogs(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchHistory();
    }
  }, [currentUser]);

  const handleStartStream = async () => {
    setIsStreaming(true);
    try {
      // Sync initial voice state with backend before opening stream
      await axios.post('http://127.0.0.1:8000/api/toggle-voice/', { active: isUrduVoiceActive });
    } catch (err) {
      console.error("Could not sync voice state with backend");
    }
  };

  const handleStopStream = async () => {
    setIsStreaming(false);
    try {
      await axios.post('http://127.0.0.1:8000/api/stop-stream/');
    } catch (err) {
      console.error("Could not send stop signal to backend");
    } finally {
      setTimeout(() => {
        fetchHistory();
      }, 800);
    }
  };

  // Fixed Voice Active/Muted Toggle Handler
  const handleToggleVoice = async () => {
    const nextState = !isUrduVoiceActive;
    setIsUrduVoiceActive(nextState);
    try {
      await axios.post('http://127.0.0.1:8000/api/toggle-voice/', { active: nextState });
    } catch (err) {
      console.error("Could not toggle voice active state");
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('username');
    setCurrentUser(null);
  };

  const handleAuthChange = (e) => {
    setAuthForm({ ...authForm, [e.target.name]: e.target.value });
    setAuthError('');
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (!authForm.username.trim()) return setAuthError('Username or Email is required.');
    
    if (isRegister) {
      if (!authForm.email.includes('@') || !authForm.email.includes('.')) {
        return setAuthError('Please enter a valid email address.');
      }
      if (authForm.password.length < 6) {
        return setAuthError('Password must be at least 6 characters.');
      }
      if (authForm.password !== authForm.confirmPassword) {
        return setAuthError('Passwords do not match.');
      }
    } else {
      if (!authForm.password) return setAuthError('Password is required.');
    }

    setAuthLoading(true);
    setAuthError('');

    try {
      const endpoint = isRegister ? 'auth/register/' : 'auth/login/';
      const payload = isRegister 
        ? { username: authForm.username, email: authForm.email, password: authForm.password }
        : { username: authForm.username, password: authForm.password };

      const res = await axios.post(`http://127.0.0.1:8000/api/${endpoint}`, payload);

      if (res.data.status === 'success') {
        const username = res.data.user ? res.data.user.username : authForm.username;
        localStorage.setItem('username', username);
        setCurrentUser(username);
      }
    } catch (err) {
      if (err.response && err.response.data) {
        setAuthError(err.response.data.error || 'Authentication failed.');
      } else {
        setAuthError('Server error. Ensure backend server is running.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <div style={styles.authPage}>
        <div style={styles.authCard}>
          <div style={styles.authHeader}>
            <Dumbbell size={40} color="#ccff00" />
            <h2 style={styles.authTitle}>FORMFIT AI</h2>
            <p style={styles.authSubtitle}>
              {isRegister ? 'Create an account to store logs in MongoDB' : 'Sign in to access AI exercise posture workspace'}
            </p>
          </div>

          {authError && (
            <div style={styles.errorBox}>
              <AlertCircle size={16} color="#ef4444" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} style={styles.authForm}>
            <div style={styles.inputGroup}>
              <label style={styles.inputLabel}>{isRegister ? 'USERNAME' : 'USERNAME OR EMAIL'}</label>
              <div style={styles.inputWrapper}>
                <User size={18} color="#64748b" />
                <input
                  type="text"
                  name="username"
                  value={authForm.username}
                  onChange={handleAuthChange}
                  placeholder={isRegister ? "Enter username" : "Enter username or email"}
                  style={styles.inputField}
                />
              </div>
            </div>

            {isRegister && (
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>EMAIL ADDRESS</label>
                <div style={styles.inputWrapper}>
                  <Mail size={18} color="#64748b" />
                  <input
                    type="email"
                    name="email"
                    value={authForm.email}
                    onChange={handleAuthChange}
                    placeholder="name@example.com"
                    style={styles.inputField}
                  />
                </div>
              </div>
            )}

            <div style={styles.inputGroup}>
              <label style={styles.inputLabel}>PASSWORD</label>
              <div style={styles.inputWrapper}>
                <Lock size={18} color="#64748b" />
                <input
                  type="password"
                  name="password"
                  value={authForm.password}
                  onChange={handleAuthChange}
                  placeholder="••••••••"
                  style={styles.inputField}
                />
              </div>
            </div>

            {isRegister && (
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>CONFIRM PASSWORD</label>
                <div style={styles.inputWrapper}>
                  <Lock size={18} color="#64748b" />
                  <input
                    type="password"
                    name="confirmPassword"
                    value={authForm.confirmPassword}
                    onChange={handleAuthChange}
                    placeholder="••••••••"
                    style={styles.inputField}
                  />
                </div>
              </div>
            )}

            <button type="submit" disabled={authLoading} style={styles.authSubmitBtn}>
              {authLoading ? 'PROCESSING...' : (isRegister ? 'CREATE ACCOUNT' : 'SIGN IN')} <ArrowRight size={16} />
            </button>
          </form>

          <div style={styles.authFooter}>
            <span>{isRegister ? 'Already registered?' : "Don't have an account?"}</span>
            <button
              type="button"
              onClick={() => { setIsRegister(!isRegister); setAuthError(''); }}
              style={styles.authToggleBtn}
            >
              {isRegister ? 'Sign In' : 'Register Now'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <nav style={styles.navbar}>
        <div style={styles.logoSection}>
          <Dumbbell size={24} color="#ccff00" />
          <span style={styles.logoText}>FORMFIT AI</span>
        </div>

        <div style={styles.navLinks}>
          {['Live Stream', 'Workout Logs', 'Analytics'].map((item) => (
            <span
              key={item}
              onClick={() => setActiveTab(item)}
              style={activeTab === item ? styles.activeNavLink : styles.navLink}
            >
              {item}
            </span>
          ))}
        </div>

        <div style={styles.navRight}>
          <div style={styles.pillBadge}>
            <span style={styles.greenDot}></span> OpenCV Feed
          </div>

          {isUrduVoiceActive ? (
            <div style={styles.pillBadgeUrdu}>
              <Volume2 size={13} color="#ccff00" /> Urdu Active
            </div>
          ) : (
            <div style={styles.pillBadgeMuted}>
              <VolumeX size={13} color="#94a3b8" /> Voice Muted
            </div>
          )}

          <div style={styles.userProfilePill}>
            <User size={13} color="#94a3b8" />
            <span>{currentUser}</span>
          </div>

          <button onClick={handleSignOut} style={styles.signOutBtn}>
            SIGN OUT <LogOut size={13} />
          </button>
        </div>
      </nav>

      {activeTab === 'Live Stream' && (
        <div style={styles.contentContainer}>
          <div style={styles.leftCol}>
            <div style={styles.subTag}>REAL-TIME POSTURE ANALYTICS</div>
            <h1 style={styles.heading}>
              BUILT FOR THE ONES <br />
              <span style={styles.headingYellow}>WHO NEVER SETTLE.</span>
            </h1>

            <p style={styles.subtext}>
              Discipline meets real-time computer vision. Track reps, verify form accuracy, and get instant Urdu audio feedback.
            </p>

            <div style={styles.controlBox}>
              <label style={styles.label}>ACTIVE EXERCISE SELECTOR</label>
              <select
                value={selectedExercise}
                onChange={(e) => setSelectedExercise(e.target.value)}
                disabled={isStreaming}
                style={styles.selectInput}
              >
                <option value="bicep_curl">Bicep Curls Evaluation</option>
                <option value="triceps_extension">Triceps Extension Evaluation</option>
                <option value="squat">Squats Evaluation</option>
                <option value="shoulder_press">Shoulder Press Evaluation</option>
                <option value="back_exercise">Back Exercise Evaluation</option>
              </select>

              <div style={styles.actionRow}>
                {!isStreaming ? (
                  <button onClick={handleStartStream} style={styles.startBtn}>
                    <Camera size={18} /> START LIVE CAMERA SESSION
                  </button>
                ) : (
                  <button onClick={handleStopStream} style={styles.stopBtn}>
                    <StopCircle size={18} /> STOP SESSION & SAVE
                  </button>
                )}

                <button
                  onClick={handleToggleVoice}
                  style={isUrduVoiceActive ? styles.audioBtnActive : styles.audioBtnMuted}
                >
                  {isUrduVoiceActive ? (
                    <>
                      <Volume2 size={16} color="#ccff00" /> Urdu Voice Active
                    </>
                  ) : (
                    <>
                      <VolumeX size={16} color="#94a3b8" /> Voice Muted
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div style={styles.rightCol}>
            <div style={styles.videoCard}>
              <div style={styles.videoHeader}>
                <span style={styles.liveTag}>
                  <span style={styles.greenDot}></span> OPENCV CAMERA STREAM
                </span>
                <span style={styles.urlText}>http://127.0.0.1:8000</span>
              </div>

              <div style={styles.videoBox}>
                {isStreaming ? (
                  <img
                    src={`http://127.0.0.1:8000/api/stream/${selectedExercise}/`}
                    alt="AI Gym Feed"
                    style={styles.videoStream}
                  />
                ) : (
                  <div style={styles.streamPlaceholder}>
                    <Camera size={56} color="#64748b" />
                    <p style={{ marginTop: '14px', fontSize: '14px', color: '#94a3b8' }}>
                      Click "START LIVE CAMERA SESSION" to begin tracking.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Analytics' && (
        <div style={styles.analyticsContainer}>
          <h2 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '24px' }}>
            PERFORMANCE & MODEL ANALYTICS
          </h2>

          <div style={styles.metricsGrid}>
            <div style={styles.metricCard}>
              <div style={styles.metricHeader}>
                <span>Highest Model Accuracy</span>
                <Award color="#ccff00" size={24} />
              </div>
              <div style={styles.metricValue}>94%</div>
              <div style={styles.metricSub}>Tested across 5 core exercise models</div>
            </div>

            <div style={styles.metricCard}>
              <div style={styles.metricHeader}>
                <span>Total Reps Verified</span>
                <Activity color="#ccff00" size={24} />
              </div>
              <div style={styles.metricValue}>1,280+</div>
              <div style={styles.metricSub}>Strict posture gated repetition count</div>
            </div>

            <div style={styles.metricCard}>
              <div style={styles.metricHeader}>
                <span>Form Precision Score</span>
                <CheckCircle2 color="#ccff00" size={24} />
              </div>
              <div style={styles.metricValue}>88.5%</div>
              <div style={styles.metricSub}>Average posture score saved in MongoDB</div>
            </div>
          </div>

          <div style={styles.recommendationCard}>
            <h3 style={{ color: '#ccff00', fontSize: '20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertCircle size={22} color="#ccff00" /> Workout Results & AI Recommendations
            </h3>
            <div style={styles.recommendationGrid}>
              <div style={styles.recItem}>
                <h4 style={{ color: '#ffffff', marginBottom: '8px' }}>1. Squats Back Alignment</h4>
                <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6' }}>
                  During low knee flexion angles, slight lower back rounding was detected. Keep chest high and hips lowered evenly.
                </p>
              </div>
              <div style={styles.recItem}>
                <h4 style={{ color: '#ffffff', marginBottom: '8px' }}>2. Bicep Curl Elbow Stability</h4>
                <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6' }}>
                  Elbows swung slightly outward on rep 6. Lock upper arms against your torso to maximize bicep isolation.
                </p>
              </div>
              <div style={styles.recItem}>
                <h4 style={{ color: '#ffffff', marginBottom: '8px' }}>3. Shoulder Press Overhead Extension</h4>
                <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6' }}>
                  Full extension achieved on 90% of reps. Ensure complete lockout at peak elevation for maximum delta engagement.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Workout Logs' && (
        <div style={styles.analyticsContainer}>
          <div style={styles.logsHeaderRow}>
            <h2 style={{ fontSize: '28px', fontWeight: '800', margin: 0 }}>
              LOGGED WORKOUT SESSIONS (MongoDB Compass)
            </h2>
            <button
              onClick={fetchHistory}
              disabled={isRefreshingLogs}
              style={styles.refreshBtn}
            >
              <RotateCcw
                size={16}
                style={{
                  animation: isRefreshingLogs ? 'spin 1s linear infinite' : 'none'
                }}
              />
              {isRefreshingLogs ? 'REFRESHING...' : 'REFRESH LOGS'}
            </button>
          </div>

          <div style={styles.tableCard}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Session ID</th>
                  <th style={styles.th}>Exercise Name</th>
                  <th style={styles.th}>Reps Completed</th>
                  <th style={styles.th}>Posture Score</th>
                  <th style={styles.th}>Assessment Summary</th>
                </tr>
              </thead>
              <tbody>
                {history.length > 0 ? (
                  history.map((row) => (
                    <tr key={row.id}>
                      <td style={styles.td}>#{row.id}</td>
                      <td style={styles.td}><strong>{row.exercise}</strong></td>
                      <td style={styles.td}>{row.repetition_count}</td>
                      <td style={styles.td}>{row.posture_score}</td>
                      <td style={styles.td}>{row.form_assessment}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" style={{ ...styles.td, textAlign: 'center', padding: '24px' }}>
                      No workout sessions stored in MongoDB yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    backgroundColor: '#0a0a0a',
    color: '#ffffff',
    minHeight: '100vh',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  authPage: {
    minHeight: '100vh',
    backgroundColor: '#0a0a0a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  authCard: {
    backgroundColor: '#121212',
    border: '1px solid #222222',
    borderRadius: '20px',
    padding: '40px',
    width: '100%',
    maxWidth: '440px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
  },
  authHeader: {
    textAlign: 'center',
    marginBottom: '28px',
  },
  authTitle: {
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: '900',
    marginTop: '12px',
    letterSpacing: '1px',
  },
  authSubtitle: {
    color: '#94a3b8',
    fontSize: '13px',
    marginTop: '6px',
  },
  errorBox: {
    backgroundColor: '#2a1215',
    border: '1px solid #7f1d1d',
    borderRadius: '10px',
    padding: '12px 16px',
    color: '#f87171',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '20px',
  },
  authForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  inputLabel: {
    color: '#ccff00',
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.8px',
  },
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #282828',
    borderRadius: '10px',
    padding: '12px 16px',
  },
  inputField: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#ffffff',
    fontSize: '14px',
    width: '100%',
    outline: 'none',
  },
  authSubmitBtn: {
    backgroundColor: '#ccff00',
    color: '#000000',
    border: 'none',
    borderRadius: '10px',
    padding: '14px',
    fontWeight: '800',
    fontSize: '14px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '10px',
  },
  authFooter: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '8px',
    marginTop: '24px',
    fontSize: '13px',
    color: '#94a3b8',
  },
  authToggleBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#ccff00',
    fontWeight: '700',
    cursor: 'pointer',
    padding: 0,
  },
  navbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 48px',
    backgroundColor: '#0d0d0d',
    borderBottom: '1px solid #1a1a1a',
  },
  logoSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoText: {
    fontWeight: '900',
    fontSize: '20px',
    letterSpacing: '1px',
    color: '#ffffff',
  },
  navLinks: {
    display: 'flex',
    gap: '32px',
  },
  navLink: {
    color: '#94a3b8',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  activeNavLink: {
    color: '#ccff00',
    fontSize: '14px',
    fontWeight: '700',
    borderBottom: '2px solid #ccff00',
    paddingBottom: '4px',
    cursor: 'pointer',
  },
  navRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  pillBadge: {
    backgroundColor: '#161616',
    border: '1px solid #262626',
    borderRadius: '20px',
    padding: '6px 14px',
    fontSize: '12px',
    color: '#e2e8f0',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontWeight: '600',
  },
  pillBadgeUrdu: {
    backgroundColor: '#1c2810',
    border: '1px solid #3f6212',
    borderRadius: '20px',
    padding: '6px 14px',
    fontSize: '12px',
    color: '#ccff00',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontWeight: '700',
  },
  pillBadgeMuted: {
    backgroundColor: '#18181b',
    border: '1px solid #27272a',
    borderRadius: '20px',
    padding: '6px 14px',
    fontSize: '12px',
    color: '#a1a1aa',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontWeight: '600',
  },
  userProfilePill: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #282828',
    borderRadius: '20px',
    padding: '6px 14px',
    fontSize: '12px',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontWeight: '600',
  },
  greenDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: '#ccff00',
    display: 'inline-block',
  },
  signOutBtn: {
    backgroundColor: '#ccff00',
    color: '#000000',
    border: 'none',
    borderRadius: '20px',
    padding: '8px 18px',
    fontWeight: '800',
    fontSize: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  contentContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '40px',
    padding: '60px 48px',
    alignItems: 'center',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  leftCol: {
    display: 'flex',
    flexDirection: 'column',
  },
  subTag: {
    color: '#ccff00',
    fontSize: '12px',
    fontWeight: '800',
    letterSpacing: '1.5px',
    marginBottom: '16px',
  },
  heading: {
    fontSize: '44px',
    fontWeight: '900',
    lineHeight: '1.1',
    margin: '0 0 20px 0',
  },
  headingYellow: {
    color: '#ccff00',
  },
  subtext: {
    color: '#94a3b8',
    fontSize: '15px',
    lineHeight: '1.6',
    marginBottom: '36px',
    maxWidth: '520px',
  },
  controlBox: {
    backgroundColor: '#121212',
    border: '1px solid #222222',
    borderRadius: '16px',
    padding: '24px',
  },
  label: {
    color: '#ccff00',
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '1px',
    display: 'block',
    marginBottom: '12px',
  },
  selectInput: {
    width: '100%',
    padding: '14px 16px',
    backgroundColor: '#1a1a1a',
    color: '#ccff00',
    border: '1px solid #333333',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '20px',
    outline: 'none',
  },
  actionRow: {
    display: 'flex',
    gap: '12px',
  },
  startBtn: {
    flex: '1.5',
    backgroundColor: '#ccff00',
    color: '#000000',
    border: 'none',
    borderRadius: '10px',
    padding: '14px',
    fontWeight: '800',
    fontSize: '13px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  stopBtn: {
    flex: '1.5',
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    padding: '14px',
    fontWeight: '800',
    fontSize: '13px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  audioBtnActive: {
    flex: '1',
    backgroundColor: '#1a1a1a',
    color: '#ccff00',
    border: '1px solid #ccff00',
    borderRadius: '10px',
    padding: '14px',
    fontWeight: '700',
    fontSize: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  audioBtnMuted: {
    flex: '1',
    backgroundColor: '#141414',
    color: '#64748b',
    border: '1px solid #262626',
    borderRadius: '10px',
    padding: '14px',
    fontWeight: '600',
    fontSize: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  rightCol: {
    display: 'flex',
    justifyContent: 'center',
  },
  videoCard: {
    backgroundColor: '#121212',
    border: '1px solid #222222',
    borderRadius: '20px',
    padding: '18px',
    width: '100%',
    boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
  },
  videoHeader: {
    display: 'flex',
    justifycontent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  liveTag: {
    color: '#ccff00',
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '1px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  urlText: {
    color: '#475569',
    fontSize: '11px',
    fontFamily: 'monospace',
  },
  videoBox: {
    width: '100%',
    height: '380px',
    backgroundColor: '#000000',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  videoStream: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  streamPlaceholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  analyticsContainer: {
    maxWidth: '1300px',
    margin: '0 auto',
    padding: '50px 48px',
  },
  logsHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  refreshBtn: {
    backgroundColor: '#1a1a1a',
    color: '#ccff00',
    border: '1px solid #ccff00',
    borderRadius: '10px',
    padding: '10px 18px',
    fontWeight: '800',
    fontSize: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '24px',
    marginBottom: '36px',
  },
  metricCard: {
    backgroundColor: '#121212',
    border: '1px solid #222222',
    borderRadius: '16px',
    padding: '28px',
  },
  metricHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: '#94a3b8',
    fontSize: '14px',
    fontWeight: '600',
  },
  metricValue: {
    fontSize: '44px',
    fontWeight: '900',
    color: '#ccff00',
    margin: '16px 0 8px 0',
  },
  metricSub: {
    fontSize: '12px',
    color: '#64748b',
  },
  recommendationCard: {
    backgroundColor: '#121212',
    border: '1px solid #222222',
    borderRadius: '16px',
    padding: '32px',
  },
  recommendationGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '24px',
    marginTop: '16px',
  },
  recItem: {
    backgroundColor: '#1a1a1a',
    borderRadius: '12px',
    padding: '20px',
    border: '1px solid #282828',
  },
  tableCard: {
    backgroundColor: '#121212',
    border: '1px solid #222222',
    borderRadius: '16px',
    padding: '24px',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    backgroundColor: '#1a1a1a',
    color: '#ccff00',
    padding: '14px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: '800',
    borderBottom: '1px solid #262626',
  },
  td: {
    padding: '14px',
    fontSize: '13px',
    color: '#e2e8f0',
    borderBottom: '1px solid #1f1f1f',
  },
};

export default App;
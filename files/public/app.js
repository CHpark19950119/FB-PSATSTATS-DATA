/* THE ARCHIVE // PSAT v4 - Core App */

const firebaseConfig = {
    apiKey: "AIzaSyAXGXSUnsPaDH-FRMTExds98XjcyY6cFp0",
    authDomain: "psat-achive.firebaseapp.com",
    projectId: "psat-achive",
    storageBucket: "psat-achive.firebasestorage.app",
    messagingSenderId: "759624468494",
    appId: "1:759624468494:web:05254990045d04c261d45f"
};

const CLAUDE_API_KEY = "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";

let db = null;
let isConnected = false;
let historyData = [];
let answerKeys = {};

function initApp() {
    loadLocalData();
    initFirebase();
}

function initFirebase() {
    try {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        
        db.collection('sessions').limit(1).get()
            .then(() => { isConnected = true; updateConnectionUI(); setupRealtimeSync(); })
            .catch(() => { isConnected = false; updateConnectionUI(); });
    } catch (e) {
        isConnected = false;
        updateConnectionUI();
    }
}

function setupRealtimeSync() {
    if (!db) return;
    
    db.collection('sessions').orderBy('timestamp', 'desc').limit(500)
        .onSnapshot(snap => {
            historyData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            localStorage.setItem('psatHistory', JSON.stringify(historyData));
            if (typeof loadDashboardData === 'function') loadDashboardData();
            if (typeof loadAnalytics === 'function') loadAnalytics();
        });
    
    db.collection('answerKeys').onSnapshot(snap => {
        snap.docs.forEach(d => answerKeys[d.id] = d.data());
        localStorage.setItem('psatAnswerKeys', JSON.stringify(answerKeys));
    });
}

function updateConnectionUI() {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    if (dot && text) {
        dot.classList.toggle('connected', isConnected);
        text.textContent = isConnected ? 'Synced' : 'Offline';
    }
}

function loadLocalData() {
    try {
        const h = localStorage.getItem('psatHistory');
        if (h) historyData = JSON.parse(h);
        const k = localStorage.getItem('psatAnswerKeys');
        if (k) answerKeys = JSON.parse(k);
    } catch (e) { historyData = []; answerKeys = {}; }
}

async function saveSession(data) {
    const session = { ...data, timestamp: new Date().toISOString() };
    historyData.unshift(session);
    localStorage.setItem('psatHistory', JSON.stringify(historyData));
    
    if (db) {
        try {
            const ref = await db.collection('sessions').add({ ...session, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            historyData[0].id = ref.id;
            localStorage.setItem('psatHistory', JSON.stringify(historyData));
        } catch (e) { console.error(e); }
    }
    return session;
}

async function deleteSession(idx) {
    const s = historyData[idx];
    if (db && s.id) try { await db.collection('sessions').doc(s.id).delete(); } catch (e) {}
    historyData.splice(idx, 1);
    localStorage.setItem('psatHistory', JSON.stringify(historyData));
}

async function saveAnswerKey(keyId, data) {
    answerKeys[keyId] = data;
    localStorage.setItem('psatAnswerKeys', JSON.stringify(answerKeys));
    if (db) try { await db.collection('answerKeys').doc(keyId).set({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); } catch (e) {}
}

async function extractAnswersFromImage(base64) {
    const prompt = `이 이미지는 PSAT 시험의 답안지입니다. 문제 번호와 정답을 추출해주세요.
JSON 형식으로만 응답: {"answers": {"1": 3, "2": 1, ...}}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            messages: [{ role: 'user', content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64.replace(/^data:image\/\w+;base64,/, '') }},
                { type: 'text', text: prompt }
            ]}]
        })
    });
    
    const data = await res.json();
    const match = data.content[0].text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]).answers;
    throw new Error('Parse failed');
}

function calculateStats() {
    const stats = { totalSessions: historyData.length, totalQuestions: 0, totalCorrect: 0, totalTimeSeconds: 0, bySubject: {}, byLocation: {}, byDate: {}, byExamType: {}, byYear: {}, streak: 0 };
    
    historyData.forEach(s => {
        stats.totalQuestions += s.total || 0;
        stats.totalCorrect += s.correct || 0;
        stats.totalTimeSeconds += s.timeSeconds || 0;
        
        if (!stats.bySubject[s.subject]) stats.bySubject[s.subject] = { total: 0, correct: 0, sessions: 0 };
        stats.bySubject[s.subject].total += s.total || 0;
        stats.bySubject[s.subject].correct += s.correct || 0;
        stats.bySubject[s.subject].sessions++;
        
        stats.byLocation[s.location] = (stats.byLocation[s.location] || 0) + 1;
        
        const date = new Date(s.timestamp).toLocaleDateString('ko-KR');
        if (!stats.byDate[date]) stats.byDate[date] = { total: 0, correct: 0, sessions: 0 };
        stats.byDate[date].total += s.total || 0;
        stats.byDate[date].correct += s.correct || 0;
        stats.byDate[date].sessions++;
        
        if (!stats.byExamType[s.examType]) stats.byExamType[s.examType] = { total: 0, correct: 0, sessions: 0 };
        stats.byExamType[s.examType].total += s.total || 0;
        stats.byExamType[s.examType].correct += s.correct || 0;
        stats.byExamType[s.examType].sessions++;
        
        if (!stats.byYear[s.year]) stats.byYear[s.year] = { total: 0, correct: 0, sessions: 0 };
        stats.byYear[s.year].total += s.total || 0;
        stats.byYear[s.year].correct += s.correct || 0;
        stats.byYear[s.year].sessions++;
    });
    
    stats.avgAccuracy = stats.totalQuestions > 0 ? Math.round((stats.totalCorrect / stats.totalQuestions) * 100) : 0;
    stats.streak = calculateStreak();
    return stats;
}

function calculateStreak() {
    if (!historyData.length) return 0;
    const dates = [...new Set(historyData.map(s => new Date(s.timestamp).toDateString()))].sort((a,b) => new Date(b) - new Date(a));
    let streak = 0, cur = new Date(); cur.setHours(0,0,0,0);
    for (const d of dates) {
        const sd = new Date(d); sd.setHours(0,0,0,0);
        const diff = Math.floor((cur - sd) / 86400000);
        if (diff === streak) streak++; else if (diff > streak) break;
    }
    return streak;
}

function getTodayStats() {
    const today = new Date().toDateString();
    const data = historyData.filter(s => new Date(s.timestamp).toDateString() === today);
    if (!data.length) return { sessions: 0, accuracy: null, timeMinutes: 0 };
    const total = data.reduce((a,s) => a + (s.total||0), 0);
    const correct = data.reduce((a,s) => a + (s.correct||0), 0);
    const time = data.reduce((a,s) => a + (s.timeSeconds||0), 0);
    return { sessions: data.length, accuracy: total > 0 ? Math.round(correct/total*100) : 0, timeMinutes: Math.round(time/60) };
}

function getWeeklyData() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const ds = d.toDateString();
        const data = historyData.filter(s => new Date(s.timestamp).toDateString() === ds);
        const total = data.reduce((a,s) => a + (s.total||0), 0);
        const correct = data.reduce((a,s) => a + (s.correct||0), 0);
        days.push({ date: d, label: d.toLocaleDateString('ko-KR', { weekday: 'short' }), accuracy: total > 0 ? Math.round(correct/total*100) : null, sessions: data.length, questions: total });
    }
    return days;
}

function getGrade(acc) {
    if (acc == null) return '--';
    if (acc >= 95) return 'A+'; if (acc >= 90) return 'A'; if (acc >= 85) return 'A-';
    if (acc >= 80) return 'B+'; if (acc >= 75) return 'B'; if (acc >= 70) return 'B-';
    if (acc >= 65) return 'C+'; if (acc >= 60) return 'C'; return 'D';
}

function loadDashboardData() {
    const stats = calculateStats(), today = getTodayStats(), weekly = getWeeklyData();
    const el = id => document.getElementById(id);
    
    if (el('todaySessions')) el('todaySessions').textContent = today.sessions;
    if (el('todayAccuracy')) el('todayAccuracy').textContent = today.accuracy != null ? `${today.accuracy}%` : '--%';
    if (el('todayTime')) el('todayTime').textContent = `${today.timeMinutes}분`;
    if (el('streak')) el('streak').textContent = `${stats.streak}일`;
    if (el('totalSolved')) el('totalSolved').textContent = stats.totalQuestions;
    
    const valid = weekly.filter(d => d.accuracy != null);
    const avg = valid.length ? Math.round(valid.reduce((a,d) => a + d.accuracy, 0) / valid.length) : '--';
    if (el('weeklyAccuracy')) el('weeklyAccuracy').textContent = avg;
    
    updateSubjectCards(stats.bySubject);
    updateRecentList();
}

function updateSubjectCards(bySubject) {
    const subs = { '언어논리': 'Language', '자료해석': 'Data', '상황판단': 'Situation' };
    Object.entries(subs).forEach(([name, id]) => {
        const d = bySubject[name] || { total: 0, correct: 0, sessions: 0 };
        const acc = d.total > 0 ? Math.round(d.correct / d.total * 100) : null;
        const el = s => document.getElementById(s);
        if (el(`grade${id}`)) el(`grade${id}`).textContent = getGrade(acc);
        if (el(`progress${id}`)) el(`progress${id}`).style.width = `${acc || 0}%`;
        if (el(`count${id}`)) el(`count${id}`).textContent = `${d.total}문제`;
        if (el(`accuracy${id}`)) el(`accuracy${id}`).textContent = acc != null ? `${acc}%` : '--%';
        if (el(`sessions${id}`)) el(`sessions${id}`).textContent = `${d.sessions}회`;
    });
}

function updateRecentList() {
    const c = document.getElementById('recentList');
    if (!c) return;
    const recent = historyData.slice(0, 5);
    if (!recent.length) { c.innerHTML = '<div class="empty-state"><span class="empty-icon">📋</span><p>아직 학습 기록이 없습니다</p></div>'; return; }
    
    const cls = { '언어논리': 'language', '자료해석': 'data', '상황판단': 'situation' };
    const emoji = { '언어논리': '📝', '자료해석': '📊', '상황판단': '🧩' };
    
    c.innerHTML = recent.map(s => {
        const d = new Date(s.timestamp);
        const sc = s.accuracy >= 80 ? 'score-high' : s.accuracy >= 60 ? 'score-mid' : 'score-low';
        return `<div class="recent-item"><div class="recent-info"><div class="recent-icon ${cls[s.subject]||''}">${emoji[s.subject]||'📚'}</div><div class="recent-details"><h4>${s.subject} - ${s.examType} ${s.year}</h4><p>${d.toLocaleDateString('ko-KR')} · ${s.location}</p></div></div><span class="recent-score ${sc}">${s.accuracy}%</span></div>`;
    }).join('');
}

function formatTime(sec) {
    const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
    return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
}

function showToast(msg, type = 'info') {
    const colors = { success: '#10B981', error: '#EF4444', info: '#6366F1', warning: '#F59E0B' };
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:24px;right:24px;padding:14px 24px;background:${colors[type]||colors.info};color:white;font-size:0.9rem;font-weight:500;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.15);z-index:1000;animation:toastIn 0.3s ease`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.animation = 'toastOut 0.3s ease forwards'; setTimeout(() => t.remove(), 300); }, 3000);
}

const st = document.createElement('style');
st.textContent = `@keyframes toastIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}@keyframes toastOut{from{transform:translateY(0);opacity:1}to{transform:translateY(20px);opacity:0}}`;
document.head.appendChild(st);

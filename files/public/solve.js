/* Solve Page JavaScript */

let timerInterval = null;
let timerSeconds = 0;
let isTimerRunning = false;
let userAnswers = {};
let currentSession = null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    initYearSelect();
    updateAnswerGrid();
    updateSessionTags();
    setupEventListeners();
});

function initYearSelect() {
    const select = document.getElementById('year');
    for (let y = 2025; y >= 2005; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = `${y}년`;
        select.appendChild(opt);
    }
}

function setupEventListeners() {
    document.getElementById('questionCount').addEventListener('change', () => {
        updateAnswerGrid();
        updateKeyGrid();
    });
    
    ['location', 'subject', 'examType', 'year'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            updateSessionTags();
            loadAnswerKeyUI();
        });
    });
    
    document.getElementById('aiUploadInput').addEventListener('change', handleAIUpload);
    document.getElementById('aiUploadBtn').addEventListener('click', () => {
        document.getElementById('aiUploadInput').click();
    });
}

// Timer
function toggleTimer() {
    isTimerRunning ? pauseTimer() : startTimer();
}

function startTimer() {
    isTimerRunning = true;
    document.getElementById('timerToggle').textContent = '⏸ Pause';
    document.getElementById('statusBadge').textContent = 'In Progress';
    timerInterval = setInterval(() => {
        timerSeconds++;
        updateTimerDisplay();
    }, 1000);
}

function pauseTimer() {
    isTimerRunning = false;
    document.getElementById('timerToggle').textContent = '▶ Start';
    document.getElementById('statusBadge').textContent = 'Paused';
    clearInterval(timerInterval);
}

function resetTimer() {
    pauseTimer();
    timerSeconds = 0;
    updateTimerDisplay();
    document.getElementById('statusBadge').textContent = 'Standby';
}

function updateTimerDisplay() {
    const h = Math.floor(timerSeconds / 3600);
    const m = Math.floor((timerSeconds % 3600) / 60);
    const s = timerSeconds % 60;
    document.getElementById('timerDisplay').textContent = 
        `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// Answer Grid
function updateAnswerGrid() {
    const count = parseInt(document.getElementById('questionCount').value) || 40;
    const grid = document.getElementById('answerGrid');
    grid.innerHTML = '';
    
    for (let i = 1; i <= count; i++) {
        const item = document.createElement('div');
        item.className = 'answer-item';
        item.dataset.q = i;
        
        const numSpan = document.createElement('span');
        numSpan.className = 'answer-num';
        numSpan.textContent = i;
        
        const btnsDiv = document.createElement('div');
        btnsDiv.className = 'answer-btns';
        
        for (let n = 1; n <= 5; n++) {
            const btn = document.createElement('button');
            btn.className = 'ans-btn';
            btn.textContent = n;
            btn.dataset.q = i;
            btn.dataset.a = n;
            if (userAnswers[i] === n) btn.classList.add('selected');
            btn.addEventListener('click', () => selectAnswer(i, n));
            btnsDiv.appendChild(btn);
        }
        
        item.appendChild(numSpan);
        item.appendChild(btnsDiv);
        grid.appendChild(item);
    }
}

function selectAnswer(q, a) {
    userAnswers[q] = a;
    
    const item = document.querySelector(`.answer-item[data-q="${q}"]`);
    if (item) {
        item.querySelectorAll('.ans-btn').forEach(btn => {
            btn.classList.remove('selected', 'correct', 'wrong');
            if (parseInt(btn.dataset.a) === a) btn.classList.add('selected');
        });
    }
}

function clearAnswers() {
    userAnswers = {};
    updateAnswerGrid();
    document.getElementById('resultsPanel').classList.remove('show');
}

// Session Tags
function updateSessionTags() {
    const location = document.getElementById('location').value;
    const subject = document.getElementById('subject').value;
    const examType = document.getElementById('examType').value;
    const year = document.getElementById('year').value;
    
    document.getElementById('sessionTags').innerHTML = `
        <span class="session-tag">${location}</span>
        <span class="session-tag">${subject}</span>
        <span class="session-tag">${examType} ${year}</span>
    `;
}

// Answer Key
function toggleAnswerKey() {
    const toggle = document.getElementById('keyToggle');
    const content = document.getElementById('keyContent');
    toggle.classList.toggle('open');
    content.classList.toggle('show');
    if (content.classList.contains('show')) updateKeyGrid();
}

function getAnswerKeyId() {
    const subject = document.getElementById('subject').value;
    const examType = document.getElementById('examType').value;
    const year = document.getElementById('year').value;
    return `${subject}_${examType}_${year}`;
}

function updateKeyGrid() {
    const count = parseInt(document.getElementById('questionCount').value) || 40;
    const grid = document.getElementById('keyGrid');
    const keyId = getAnswerKeyId();
    const currentKey = answerKeys[keyId] || {};
    
    grid.innerHTML = '';
    
    for (let i = 1; i <= count; i++) {
        const item = document.createElement('div');
        item.className = 'key-item';
        
        const label = document.createElement('label');
        label.textContent = i;
        
        const select = document.createElement('select');
        select.className = 'form-select';
        select.innerHTML = `<option value="">-</option>` +
            [1,2,3,4,5].map(n => 
                `<option value="${n}" ${currentKey[i] == n ? 'selected' : ''}>${n}</option>`
            ).join('');
        select.addEventListener('change', (e) => updateKeyValue(i, e.target.value));
        
        item.appendChild(label);
        item.appendChild(select);
        grid.appendChild(item);
    }
}

function updateKeyValue(q, v) {
    const keyId = getAnswerKeyId();
    if (!answerKeys[keyId]) answerKeys[keyId] = {};
    answerKeys[keyId][q] = v ? parseInt(v) : null;
}

async function saveAnswerKeyUI() {
    const keyId = getAnswerKeyId();
    await saveAnswerKey(keyId, answerKeys[keyId] || {});
    showToast('정답 키가 저장되었습니다.', 'success');
}

function loadAnswerKeyUI() {
    const keyId = getAnswerKeyId();
    if (answerKeys[keyId] && Object.keys(answerKeys[keyId]).length > 0) {
        updateKeyGrid();
        showToast('저장된 정답 키를 불러왔습니다.', 'success');
    }
}

// AI Upload
async function handleAIUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const btn = document.getElementById('aiUploadBtn');
    const status = document.getElementById('aiStatus');
    
    btn.disabled = true;
    btn.textContent = '⏳ 분석 중...';
    status.textContent = 'AI가 답안을 분석하고 있습니다...';
    
    try {
        const base64 = await fileToBase64(file);
        const answers = await extractAnswersFromImage(base64);
        
        if (answers && Object.keys(answers).length > 0) {
            const keyId = getAnswerKeyId();
            answerKeys[keyId] = {};
            
            Object.entries(answers).forEach(([q, a]) => {
                answerKeys[keyId][parseInt(q)] = parseInt(a);
            });
            
            // 저장
            await saveAnswerKey(keyId, answerKeys[keyId]);
            
            updateKeyGrid();
            status.textContent = `✓ ${Object.keys(answers).length}개 답안 추출 및 저장 완료!`;
            showToast('AI 답안 추출 및 저장 완료!', 'success');
        } else {
            throw new Error('답안을 찾을 수 없습니다');
        }
    } catch (error) {
        console.error('AI extraction error:', error);
        status.textContent = '❌ 추출 실패. 다시 시도해주세요.';
        showToast('답안 추출에 실패했습니다.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '📷 이미지 업로드';
        event.target.value = '';
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Submit & Grade
function submitAnswers() {
    const keyId = getAnswerKeyId();
    const key = answerKeys[keyId];
    
    if (!key || Object.keys(key).length === 0) {
        showToast('먼저 정답 키를 설정해주세요.', 'error');
        return;
    }
    
    const count = parseInt(document.getElementById('questionCount').value) || 40;
    let correct = 0;
    let wrong = 0;
    const wrongQuestions = [];
    
    for (let i = 1; i <= count; i++) {
        const userAns = userAnswers[i];
        const correctAns = key[i];
        
        if (!correctAns) continue;
        
        const item = document.querySelector(`.answer-item[data-q="${i}"]`);
        const btns = item ? item.querySelectorAll('.ans-btn') : [];
        
        if (userAns === correctAns) {
            correct++;
            btns.forEach(btn => {
                if (parseInt(btn.dataset.a) === correctAns) btn.classList.add('correct');
            });
        } else {
            wrong++;
            btns.forEach(btn => {
                const a = parseInt(btn.dataset.a);
                if (a === userAns) btn.classList.add('wrong');
                if (a === correctAns) btn.classList.add('correct');
            });
            wrongQuestions.push({ num: i, user: userAns || '-', correct: correctAns });
        }
    }
    
    const total = correct + wrong;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    
    document.getElementById('resultsScore').textContent = `${accuracy}%`;
    document.getElementById('resultsGrade').textContent = getGrade(accuracy);
    document.getElementById('correctCount').textContent = correct;
    document.getElementById('wrongCount').textContent = wrong;
    document.getElementById('timeSpent').textContent = formatTime(timerSeconds);
    
    const wrongList = document.getElementById('wrongList');
    if (wrongQuestions.length > 0) {
        wrongList.innerHTML = `
            <div class="wrong-title">틀린 문제 (${wrongQuestions.length}개)</div>
            ${wrongQuestions.map(q => `
                <div class="wrong-item">
                    <span class="wrong-num">${q.num}번</span>
                    <span class="wrong-ans">내 답: <span class="user">${q.user}</span> / 정답: <span class="correct">${q.correct}</span></span>
                </div>
            `).join('')}
        `;
    } else {
        wrongList.innerHTML = '<p style="text-align:center;color:var(--success);font-weight:600">🎉 전부 정답입니다!</p>';
    }
    
    document.getElementById('resultsPanel').classList.add('show');
    
    currentSession = {
        location: document.getElementById('location').value,
        subject: document.getElementById('subject').value,
        examType: document.getElementById('examType').value,
        year: document.getElementById('year').value,
        correct, wrong, total, accuracy,
        timeSeconds: timerSeconds,
        wrongQuestions,
        userAnswers: { ...userAnswers }
    };
    
    pauseTimer();
}

async function saveSessionUI() {
    if (!currentSession) {
        showToast('먼저 채점을 해주세요.', 'error');
        return;
    }
    
    await saveSession(currentSession);
    showToast('학습 기록이 저장되었습니다!', 'success');
    
    currentSession = null;
    clearAnswers();
    resetTimer();
}

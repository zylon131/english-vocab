// ================= Data State =================
let state = {
    totalPoints: 0,
    history: [], 
    rewards: [
        { id: 1, name: '看动画片 30 分钟', threshold: 100 },
        { id: 2, name: '去游乐园玩', threshold: 500 }
    ],
    lastEvaluatedDate: null,
    // New fields for Version 3 (Plan Mode)
    mode: 'point',          // 'point' | 'plan'
    masteredIndices: [],    // Store indices of words already learned in Plan Mode
    dailyGoal: 50,          // User's plan goal
    currentBatch: []        // [{ index, word, status: 'untested'|'correct'|'wrong' }]
};

function loadState() {
    const saved = localStorage.getItem('vocab_state_v3');
    if (saved) {
        state = JSON.parse(saved);
        if(!state.rewards) state.rewards = [];
        if(!state.history) state.history = [];
        if(!state.mode) state.mode = 'point';
        if(state.masteredIndices === undefined) {
            // Migrate from old currentIndex if needed
            state.masteredIndices = [];
            if (state.currentIndex > 0) {
                for (let i = 0; i < state.currentIndex; i++) state.masteredIndices.push(i);
            }
        }
        if(state.dailyGoal === undefined) state.dailyGoal = 50;
        if(!state.currentBatch) state.currentBatch = [];
    } else {
        // Migration from v2 if exists
        const old = localStorage.getItem('vocab_state_v2');
        if (old) {
            const oldData = JSON.parse(old);
            state.totalPoints = oldData.totalPoints || 0;
            state.history = oldData.history || [];
            state.rewards = oldData.rewards || state.rewards;
            state.lastEvaluatedDate = oldData.lastEvaluatedDate;
        }
    }
}

function saveState() {
    localStorage.setItem('vocab_state_v3', JSON.stringify(state));
}

// ================= UI Elements =================
const setupScreen = document.getElementById('setup-screen');
const gameScreen = document.getElementById('game-screen');
const successScreen = document.getElementById('success-screen');
const reviewScreen = document.getElementById('review-screen');

const targetScoreInput = document.getElementById('target-score-input');
const dailyCountInput = document.getElementById('daily-count-input');
const planProgressText = document.getElementById('plan-progress-text');

const startBtn = document.getElementById('start-btn');
const quitBtn = document.getElementById('quit-btn');
const restartBtn = document.getElementById('restart-btn');
const retestBtn = document.getElementById('retest-btn');
const finishPlanBtn = document.getElementById('finish-plan-btn');

const currentScoreEl = document.getElementById('current-score');
const targetScoreDisplay = document.getElementById('target-score-display');
const progressLabel = document.getElementById('progress-label');
const targetLabel = document.getElementById('target-label');

const wordFreqEl = document.getElementById('word-freq');
const chineseMeaningEl = document.getElementById('chinese-meaning');
const phoneticHintEl = document.getElementById('phonetic-hint');
const englishInput = document.getElementById('english-input');
const submitBtn = document.getElementById('submit-btn');

const finalTargetEl = document.getElementById('final-target');
const finalTotalScoreEl = document.getElementById('final-total-score');
const successTitle = document.getElementById('success-title');
const successMsg = document.getElementById('success-msg');
const nextRewardInfo = document.getElementById('next-reward-info');
const nextRewardNameEl = document.getElementById('next-reward-name');
const nextRewardDiffEl = document.getElementById('next-reward-diff');
const toastEl = document.getElementById('toast');
const globalTotalPointsEl = document.getElementById('global-total-points');

// Modals
const btnRewards = document.getElementById('btn-rewards');
const btnHistory = document.getElementById('btn-history');
const rewardsModal = document.getElementById('rewards-modal');
const historyModal = document.getElementById('history-modal');
const closeRewards = document.getElementById('close-rewards');
const closeHistory = document.getElementById('close-history');
const rewardsListContainer = document.getElementById('rewards-list-container');
const historyListContainer = document.getElementById('history-list-container');
const btnAddReward = document.getElementById('add-reward-btn');
const inputRewardName = document.getElementById('reward-name');
const inputRewardPoints = document.getElementById('reward-points');

// Review Elements
const statAccuracy = document.getElementById('stat-accuracy');
const statRemaining = document.getElementById('stat-remaining');
const reviewWordList = document.getElementById('review-word-list');

// Session State
let currentWord = null;
let currentBatchIndex = -1; // Index within currentBatch array

const freqConfig = {
    high: { label: '高频 (+1 / -1)', points: 1, class: 'high' },
    mid: { label: '中频 (+2 / -2)', points: 2, class: 'mid' },
    low: { label: '低频 (+3 / -3)', points: 3, class: 'low' }
};

// ================= Initialization & Lifecycle =================
function init() {
    loadState();
    
    // Mode Switcher setup
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.mode = tab.dataset.mode;
            updateModeSettingsVisibility();
            saveState();
        });
        // Set initial active tab
        if(tab.dataset.mode === state.mode) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    updateModeSettingsVisibility();
    updateGlobalScoreUI();
    
    // Check missing days penalty (only relevant for Point Mode completion log)
    checkDailyPenalty();
}

function updateModeSettingsVisibility() {
    const pointSettings = document.getElementById('point-settings');
    const planSettings = document.getElementById('plan-settings');
    
    if (state.mode === 'point') {
        pointSettings.classList.remove('hidden');
        planSettings.classList.add('hidden');
        targetLabel.textContent = "目标积分";
        progressLabel.textContent = "当前进度";
    } else {
        pointSettings.classList.add('hidden');
        planSettings.classList.remove('hidden');
        targetLabel.textContent = "本轮总数";
        progressLabel.textContent = "掌握情况";
        
        const totalWords = typeof words !== 'undefined' ? words.length : 2000;
        const mastered = state.masteredIndices ? state.masteredIndices.length : 0;
        planProgressText.textContent = `已背完 ${mastered}/${totalWords} 词`;
        dailyCountInput.value = state.dailyGoal;
    }
}

function checkDailyPenalty() {
    const todayStr = new Date().toISOString().split('T')[0];
    if (!state.lastEvaluatedDate) {
        state.lastEvaluatedDate = todayStr;
        saveState();
    } else {
        const last = new Date(state.lastEvaluatedDate);
        const curr = new Date(todayStr);
        const diffDays = Math.floor((curr - last) / (1000 * 60 * 60 * 24));
        
        if (diffDays > 0) {
            let missedCount = 0;
            for (let i = 0; i < diffDays; i++) {
                let evalDate = new Date(last.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
                let evalDateStr = evalDate.toISOString().split('T')[0];
                if (evalDateStr === todayStr) break;

                let hasHistory = state.history.some(h => h.date === evalDateStr && h.points > 0);
                if (!hasHistory) {
                    state.totalPoints -= 20;
                    state.history.push({ date: evalDateStr, points: -20, note: '漏打卡扣分' });
                    missedCount++;
                }
            }
            if (missedCount > 0) {
                setTimeout(() => showToast(`检测到您漏打卡 ${missedCount} 天，已扣除 ${missedCount * 20} 积分！`, false), 1000);
            }
            state.lastEvaluatedDate = todayStr;
            saveState();
        }
    }
}

function updateGlobalScoreUI() {
    globalTotalPointsEl.textContent = state.totalPoints;
}

// ================= Game Flow =================
function initGame() {
    if (state.mode === 'point') {
        initPointMode();
    } else {
        initPlanMode();
    }
}

function initPointMode() {
    const target = parseInt(targetScoreInput.value) || 10;
    state.pointTarget = target;
    state.currentPointScore = 0;
    
    targetScoreDisplay.textContent = target;
    currentScoreEl.textContent = 0;
    
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    loadNextWord();
}

function initPlanMode() {
    const requestedCount = parseInt(dailyCountInput.value) || 50;
    
    // Ensure stats exist
    if (!state.wordStats) state.wordStats = {};

    // Regenerate batch if empty or if count changed
    if (state.currentBatch.length === 0 || state.currentBatch.length !== requestedCount) {
        state.dailyGoal = requestedCount;
        state.currentBatch = [];
        
        // Find all unmastered words and calculate weights
        let weightedList = [];
        for (let i = 0; i < words.length; i++) {
            if (!state.masteredIndices.includes(i)) {
                const stats = state.wordStats[i] || { e: 0, s: 0 };
                // Weight formula: base 10 + (errors * 20). 
                // This makes words with errors much more likely to show up.
                const weight = 10 + (stats.e * 20);
                weightedList.push({ index: i, weight: weight + (Math.random() * 5) });
            }
        }
        
        if (weightedList.length === 0) {
            showToast("恭喜你！你已经背完了所有单词！", true);
            return;
        }

        // Sort by weight (highest first)
        weightedList.sort((a, b) => b.weight - a.weight);
        
        // Take the top weighted words
        const numToTake = Math.min(state.dailyGoal, weightedList.length);
        for (let i = 0; i < numToTake; i++) {
            state.currentBatch.push({
                index: weightedList[i].index,
                status: 'untested'
            });
        }
    }

    targetScoreDisplay.textContent = state.currentBatch.length;
    updatePlanScore();
    
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    saveState();
    loadNextWord();
}

function updatePlanScore() {
    const mastered = state.currentBatch.filter(w => w.status === 'correct').length;
    currentScoreEl.textContent = mastered;
}

function loadNextWord() {
    if (typeof words === 'undefined' || words.length === 0) {
        showToast("词库未加载，请刷新页面", false);
        return;
    }

    if (state.mode === 'point') {
        currentWord = words[Math.floor(Math.random() * words.length)];
    } else {
        // Find next word in batch that is 'untested'
        const remainingIdx = state.currentBatch.findIndex(w => w.status === 'untested');
        if (remainingIdx === -1) {
            // All words have been tested in this round
            handleBatchRoundComplete();
            return;
        }
        currentBatchIndex = remainingIdx;
        const wordData = state.currentBatch[remainingIdx];
        currentWord = words[wordData.index];
        wordData.status = 'testing'; // Temporary mark to avoid double picking if logic gets recursive
    }

    renderWordUI();
}

function renderWordUI() {
    const config = freqConfig[currentWord.frequency];
    wordFreqEl.textContent = config.label;
    wordFreqEl.className = 'frequency-badge ' + config.class;
    
    chineseMeaningEl.textContent = currentWord.meaning;
    phoneticHintEl.textContent = currentWord.phonetic;
    phoneticHintEl.classList.remove('visible');
    
    englishInput.value = '';
    englishInput.focus();
}

function checkAnswer() {
    if (!currentWord) return;
    const userInput = englishInput.value.trim().toLowerCase();
    if (!userInput) return;
    
    const isCorrect = userInput === currentWord.word.toLowerCase();
    
    if (state.mode === 'point') {
        const config = freqConfig[currentWord.frequency];
        if (isCorrect) {
            state.currentPointScore += config.points;
            showToast('回答正确！+' + config.points, true);
        } else {
            state.currentPointScore -= config.points;
            showToast('错误！正确答案: ' + currentWord.word, false);
            shakeCard();
        }
        currentScoreEl.textContent = state.currentPointScore;
        if (state.currentPointScore >= state.pointTarget) {
            setTimeout(handlePointModeSuccess, 600);
        } else {
            setTimeout(loadNextWord, 800);
        }
    } else {
        const wordInBatch = state.currentBatch[currentBatchIndex];
        const idx = wordInBatch.index;
        if (!state.wordStats[idx]) state.wordStats[idx] = { e: 0, s: 0 };
        const stats = state.wordStats[idx];

        if (isCorrect) {
            wordInBatch.status = 'correct';
            stats.s++; // 连续正确次数 +1
            if (stats.s >= 3) {
                if (!state.masteredIndices.includes(idx)) {
                    state.masteredIndices.push(idx);
                }
            }
            showToast('回答正确！', true);
        } else {
            wordInBatch.status = 'wrong';
            stats.e++; // 错误总数 +1
            stats.s = 0; // 连续正确中断，重置为 0
            showToast('回答错误！已记录', false);
            shakeCard();
        }
        updatePlanScore();
        saveState();
        setTimeout(loadNextWord, 600);
    }
}

function shakeCard() {
    const card = document.querySelector('.game-card');
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
}

// ================= Mode Completion Logic =================

function handlePointModeSuccess() {
    const todayStr = new Date().toISOString().split('T')[0];
    const todaysSuccess = state.history.find(h => h.date === todayStr && h.points > 0);
    
    if (!todaysSuccess) {
        state.totalPoints += state.pointTarget;
        state.history.push({ date: todayStr, points: state.pointTarget, note: '达成挑战' });
        saveState();
        updateGlobalScoreUI();
    }

    showSuccessScreen(state.pointTarget, `今日打卡成功！`, `由于完成了设定的目标 ${state.pointTarget} 分，您的总积分增加了！`);
}

function handleBatchRoundComplete() {
    // Reset any existing filter from a previous run
    reviewWordList.classList.remove('show-only-wrong');
    const remainingBox = document.getElementById('stat-remaining-box');
    const remainingLabel = document.getElementById('stat-remaining-label');
    if (remainingBox) {
        remainingBox.classList.remove('filtering-wrong');
        remainingLabel.textContent = "🔴 点击看错题";
    }

    // Check if everything is correct
    const allCorrect = state.currentBatch.every(w => w.status === 'correct');
    
    gameScreen.classList.add('hidden');
    reviewScreen.classList.remove('hidden');
    
    renderReviewList();
    
    const correctCount = state.currentBatch.filter(w => w.status === 'correct').length;
    const accuracy = Math.round((correctCount / state.currentBatch.length) * 100);
    statAccuracy.textContent = accuracy + '%';
    const remainingCount = state.currentBatch.length - correctCount;
    statRemaining.textContent = remainingCount;

    // Attach click handler for filtering if it's the first time or reuseable
    if (remainingBox) {
        remainingBox.onclick = () => {
            const isFiltering = reviewWordList.classList.toggle('show-only-wrong');
            remainingBox.classList.toggle('filtering-wrong', isFiltering);
            remainingLabel.textContent = isFiltering ? "👇 点击看全量" : "🔴 点击看错题";
        };
    }

    if (allCorrect) {
        finishPlanBtn.classList.remove('hidden');
        retestBtn.classList.add('hidden');
    } else {
        finishPlanBtn.classList.add('hidden');
        retestBtn.classList.remove('hidden');
    }
}

function renderReviewList() {
    reviewWordList.innerHTML = '';
    state.currentBatch.forEach(item => {
        const wordObj = words[item.index];
        const el = document.createElement('div');
        el.className = `review-item ${item.status}`;
        el.innerHTML = `
            <div class="review-word-info">
                <div class="word-with-phonetic">
                    <strong>${wordObj.word}</strong>
                    <span class="phonetic-small">${wordObj.phonetic || ''}</span>
                </div>
                <span>${wordObj.meaning}</span>
            </div>
            <div class="status-tag ${item.status}">
                ${item.status === 'correct' ? '掌握' : '还需学习'}
            </div>
        `;
        reviewWordList.appendChild(el);
    });
}

retestBtn.addEventListener('click', () => {
    // Reset any words that are NOT 'correct' to 'untested' to ensure they can be re-tested
    if (state.currentBatch && state.currentBatch.length > 0) {
        state.currentBatch.forEach(w => {
            if (w.status !== 'correct') {
                w.status = 'untested';
            }
        });
    }
    
    // Switch screens
    reviewScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    
    saveState();
    loadNextWord();
});

finishPlanBtn.addEventListener('click', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Calculate total reward based on word frequencies in the batch
    let reward = 0;
    const completedIndices = [];
    state.currentBatch.forEach(item => {
        const wordObj = words[item.index];
        const config = freqConfig[wordObj.frequency];
        if (config) {
            reward += config.points;
        }
        completedIndices.push(item.index);
    });
    
    state.totalPoints += reward;
    state.history.push({ date: todayStr, points: reward, note: `计划模式：学完 ${completedIndices.length} 个新词` });
    
    // Update mastered list - avoid duplicates
    completedIndices.forEach(idx => {
        if (!state.masteredIndices.includes(idx)) {
            state.masteredIndices.push(idx);
        }
    });

    state.currentBatch = [];
    
    saveState();
    updateGlobalScoreUI();
    updateModeSettingsVisibility(); // Update progress text
    
    reviewScreen.classList.add('hidden');
    showSuccessScreen(reward, `学习计划大成功！`, `恭喜你！今天又攻克了 ${dailyCountInput.value} 个随机新单词。`);
});

function showSuccessScreen(finalPoints, title, msg) {
    successTitle.textContent = title;
    successMsg.textContent = msg;
    finalTargetEl.textContent = finalPoints;
    finalTotalScoreEl.textContent = state.totalPoints;
    
    let unreachedRewards = state.rewards.filter(r => r.threshold > state.totalPoints);
    unreachedRewards.sort((a,b) => a.threshold - b.threshold);
    
    if (unreachedRewards.length > 0) {
        let nxt = unreachedRewards[0];
        nextRewardInfo.style.display = 'block';
        nextRewardNameEl.textContent = nxt.name;
        nextRewardDiffEl.textContent = (nxt.threshold - state.totalPoints);
    } else {
        nextRewardInfo.style.display = 'none';
    }
    
    gameScreen.classList.add('hidden');
    successScreen.classList.remove('hidden');
}

// ================= Modals Logic =================
function renderRewards() {
    rewardsListContainer.innerHTML = '';
    let sortedRewards = [...state.rewards].sort((a,b) => a.threshold - b.threshold);
    sortedRewards.forEach(r => {
        let isReached = state.totalPoints >= r.threshold;
        let el = document.createElement('div');
        el.className = 'list-item';
        el.innerHTML = `
            <div>
                <strong style="color: ${isReached ? 'var(--high-freq)' : 'inherit'};">
                    ${isReached ? '✅ ' : '🔒 '}${r.name}
                </strong>
                <p style="font-size:0.8rem; margin:0; text-align:left;">需要积分: ${r.threshold}</p>
            </div>
            <div style="display:flex; gap: 8px;">
                ${isReached ? `<button class="btn-small" style="background:var(--success);" onclick="redeemReward(${r.id})">兑换</button>` : ''}
                <button class="btn-small" onclick="deleteReward(${r.id})">删除</button>
            </div>
        `;
        rewardsListContainer.appendChild(el);
    });
}

window.deleteReward = function(id) {
    state.rewards = state.rewards.filter(r => r.id !== id);
    saveState();
    renderRewards();
};

window.redeemReward = function(id) {
    let r = state.rewards.find(x => x.id === id);
    if (!r || state.totalPoints < r.threshold) return;
    
    state.totalPoints -= r.threshold;
    const todayStr = new Date().toISOString().split('T')[0];
    state.history.push({ date: todayStr, points: -r.threshold, note: `兑换奖励: ${r.name}` });
    
    saveState();
    renderRewards();
    updateGlobalScoreUI();
    showToast(`成功兑换: ${r.name}！`, true);
};

btnAddReward.addEventListener('click', () => {
    let name = inputRewardName.value.trim();
    let pts = parseInt(inputRewardPoints.value);
    if (!name || isNaN(pts) || pts <= 0) {
        showToast("请输入有效内容", false);
        return;
    }
    state.rewards.push({ id: Date.now(), name, threshold: pts });
    saveState();
    inputRewardName.value = '';
    inputRewardPoints.value = '';
    renderRewards();
});

function renderHistory() {
    historyListContainer.innerHTML = '';
    let sortedHistory = [...state.history].sort((a,b) => b.date.localeCompare(a.date));
    if (sortedHistory.length === 0) {
        historyListContainer.innerHTML = '<p style="text-align:center;">暂无记录</p>';
        return;
    }
    sortedHistory.forEach(h => {
        let isPos = h.points > 0;
        let el = document.createElement('div');
        el.className = `list-item history-item ${isPos ? 'positive' : 'negative'}`;
        el.innerHTML = `
            <div><p class="history-date" style="text-align:left; margin:0;">${h.date}</p><p style="font-size:0.9rem; margin:0; text-align:left;">${h.note}</p></div>
            <div class="history-points ${isPos ? 'positive' : 'negative'}">${isPos ? '+' : ''}${h.points}</div>
        `;
        historyListContainer.appendChild(el);
    });
}

// ================= Global Event Listeners =================
startBtn.addEventListener('click', initGame);
quitBtn.addEventListener('click', () => {
    gameScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
    updateGlobalScoreUI();
    updateModeSettingsVisibility();
});
restartBtn.addEventListener('click', () => {
    successScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
    updateModeSettingsVisibility();
});
submitBtn.addEventListener('click', checkAnswer);
englishInput.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') { e.preventDefault(); checkAnswer(); }
    else if (e.code === 'Space') { e.preventDefault(); phoneticHintEl.classList.add('visible'); }
});
btnRewards.addEventListener('click', () => { renderRewards(); rewardsModal.classList.remove('hidden'); });
closeRewards.addEventListener('click', () => rewardsModal.classList.add('hidden'));
btnHistory.addEventListener('click', () => { renderHistory(); historyModal.classList.remove('hidden'); });
closeHistory.addEventListener('click', () => historyModal.classList.add('hidden'));

function showToast(message, isSuccess) {
    toastEl.textContent = message;
    toastEl.className = 'toast show ' + (isSuccess ? 'success' : 'error');
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => { toastEl.className = 'toast hidden'; }, 2500);
}

init();
